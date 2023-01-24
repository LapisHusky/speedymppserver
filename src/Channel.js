import { getChannelType } from "./util.js"
import { Participant } from "./Participant.js"
import { stringToArrayBuffer } from "./util.js"
import { BinaryWriter } from "./binary.js"

export class Channel {
  constructor(server, id, set, creatorId) {
    this.server = server
    this.id = id

    this.settings = {
      chat: true,
      visible: true,
      crownsolo: false,
      "no cussing": false
    }
    //0: non lobby
    //1: test/ lobby
    //2: true lobby (will have 20 player limit)
    this.type = getChannelType(id)
    if (this.type > 0) {
      this.settings.color = 0x73b3cc
      this.settings.color2 = 0x273546
      this.settings.lobby = true
      this.crown = null
      this.bans = null
    } else {
      this.settings.color = 0x3b5054
      this.settings.lobby = false
      if (set) Object.assign(this.settings, set)
      this.crown = {
        userId: creatorId,
        dropped: false
      }
      this.bans = new Map()
    }

    this.participantsBy_id = new Map()
    this.participantsById = new Map()
    this.chatLog = []
    this.wsTopic = stringToArrayBuffer(`\x00${this.id}`)

    this.participantUpdates = new Set()
    this.tickBroadcasts = []
    this.addToChatLog = []
    this.updateSettings = false
    this.updateCrown = false
    this.participantRemoves = []
  }

  getOrCreateParticipant(user) {
    let id = user.id
    if (this.participantsBy_id.has(id)) return this.participantsBy_id.get(id)
    
    //participant does not exist, add a new one
    let participant = new Participant(this, user, this.server.participantIdCounter++)
    this.participantsBy_id.set(id, participant)
    this.participantsById.set(participant.id, participant)

    //tick stuff
    this.participantUpdated(participant)

    //check if we're picking up the crown
    crownChecks: {
      if (this.type > 0) break crownChecks
      if (this.crown.participantId) break crownChecks
      if (this.crown.userId !== user.id) break crownChecks
      //if we're the first joiner and we're picking up the crown, don't send ch to everyone, they'll all have already received it
      this.giveCrown(participant, this.participantsBy_id.size === 1)
    }

    if (this.settings.visible) this.server.channelUpdates.add(this)

    return participant
  }

  removeParticipant(participant) {
    this.participantsBy_id.delete(participant.user.id)
    this.participantsById.delete(participant.id)

    //tick stuff
    this.participantRemoves.push(participant.id)
    this.participantUpdates.delete(participant)

    //check if we're dropping the crown
    crownChecks: {
      if (this.type > 0) break crownChecks
      if (this.crown.dropped) break crownChecks
      if (this.crown.userId !== participant.user.id) break crownChecks
      this.dropCrown(participant)
    }

    if (this.participantsBy_id.size === 0) {
      this.server.removeChannel(this)
    } else if (this.settings.visible) {
      this.server.channelUpdates.add(this)
    }
  }

  giveCrown(participant, noUpdate) {
    this.crown.userId = participant.user.id
    this.crown.dropped = false
    if (!noUpdate) this.updateCrown = true
  }

  dropCrown(participant) {
    this.crown.userId = participant.user.id //this line probably isn't needed
    this.crown.dropped = true
    this.crown.time = Date.now()
    this.crown.startX = participant.x
    this.crown.startY = participant.y
    this.crown.endX = Math.max(6553, Math.min(58981, participant.x))
    this.crown.endY = Math.random() * 13107 + 45874
    this.updateCrown = true
  }

  getInfo() {
    let object = {
      _id: this.id,
      settings: this.settings,
      count: this.participantsBy_id.size
    }
    if (this.crown) object.crown = this.crown
    return object
  }

  getPpl() {
    let writer = new BinaryWriter()
    writer.writeVarlong(this.participantsBy_id.size)
    for (let participant of this.participantsBy_id.values()) {
      writer.writeBuffer(participant.getFullInfo())
    }
    return writer.getBuffer()
  }

  getChatLog() {
    let writer = new BinaryWriter()
    writer.writeVarlong(this.chatLog.length)
    for (let buffer of this.chatLog) {
      writer.writeBuffer(buffer)
    }
    return writer.getBuffer()
  }

  isBanned(id) {
    if (!this.bans.has(id)) return false
    let expirationTime = this.bans.get(id)
    if (expirationTime > Date.now()) return expirationTime - Date.now()
    this.clearExpiredBans()
    return false
  }

  //should only be called if this is a non lobby
  clearExpiredBans() {
    let now = Date.now()
    for (let [id, time] of this.bans.entries()) {
      if (time > now) continue
      this.bans.delete(id)
    }
  }

  //should only be called if this is a true lobby
  isFull() {
    return this.participantsBy_id.size >= 20
  }

  tick() {
    if (this.updateSettings) {
      if (this.settings.visible) {
        this.server.channelUpdates.add(this)
      } else {
        this.server.channelUpdates.delete(this)
      }
    }

    if (this.participantUpdates.size === 0 && this.tickBroadcasts.length === 0 && !this.updateSettings && !this.updateCrown && this.participantRemoves.length === 0) return

    let writer = new BinaryWriter()
    
    if (this.participantUpdates.size > 0) {
      writer.writeUInt8(0x03)
      writer.writeVarlong(this.participantUpdates.size)
      for (let participant of this.participantUpdates.values()) {
        writer.writeBuffer(participant.getUpdate())
      }
      this.participantUpdates = new Set()
    }

    if (this.tickBroadcasts.length > 0) {
      for (let message of this.tickBroadcasts) {
        writer.writeBuffer(message)
      }
      this.tickBroadcasts = []
    }

    if (this.participantRemoves.length > 0) {
      writer.writeUInt8(0x04)
      writer.writeVarlong(this.participantRemoves.length)
      for (let id of this.participantRemoves) {
        writer.writeVarlong(id)
      }
      this.participantRemoves = []
    }

    if (this.addToChatLog.length > 0) {
      let totalLength = this.chatLog.length + this.addToChatLog.length
      let extraCount = totalLength - 32
      if (extraCount > 32) {
        //we're adding a lot of messages, no point in even keeping old chatLog, instead replace entirely with the last 32 sent messages
        this.chatLog = this.addToChatLog.slice(this.addToChatLog.length - 32)
      } else {
        if (extraCount > 0) {
          //we're adding enough messages to overflow the chatLog limit of 32, let's splice the start of the array to make it short enough, then push new messages to the end
          this.chatLog.splice(0, extraCount)
        }
        //add new messages to the end
        this.chatLog.push(...this.addToChatLog)
      }
      this.addToChatLog = []
    }

    if (this.updateCrown) {
      this.updateCrown = false
      writer.writeUInt8(0x0a)
      writer.writeBuffer(this.getCrown())
    }

    if (this.updateSettings) {
      this.updateSettings = false
      writer.writeUInt8(0x09)
      writer.writeBuffer(this.getSettings())
    }

    console.log(writer.getBuffer())
    this.broadcastBuffer(writer.getBuffer())

    return //////////////////////////////////////////////////////////////////// old code below, to be removed later

    let messageArray = []
    if (this.updateChannelInfo) {
      let ppl = []
      for (let participant of this.participantsBy_id.values()) {
        ppl.push(participant.getUpdate())
      }
      messageArray.push({
        m: "ch",
        ch: this.getInfo(),
        ppl
      })
      this.updateChannelInfo = false
    } else {
      for (let participant of this.participantUpdates.values()) {
        let messageType = (participant.nameChanged || participant.colorChanged || participant.updateEverything) ? "p" : "m"
        let object = participant.getUpdate()
        object.m = messageType
        messageArray.push(object)
      }
      for (let id of this.participantRemoves) {
        messageArray.push({
          m: "bye",
          p: id
        })
      }
    }
    for (let message of this.bufferedChatMessages) {
      messageArray.push(message)
    }
    for (let message of this.bufferedNotifications) {
      messageArray.push(message)
    }

    this.broadcastArray(messageArray)

    this.participantUpdates = new Set()
    this.participantRemoves = []
    if (this.bufferedChatMessages.length > 0) {
      //delete "m" in the message since new clients will know it's a chat message because it's part of "c"
      for (let message of this.bufferedChatMessages) {
        delete message.m
      }
      //calculations to update this.chatLog
      //the reason chatLog is updated here instead of immediately is so that new clients in the channel don't receive messages twice
      let totalLength = this.chatLog.length + this.bufferedChatMessages.length
      let extraCount = totalLength - 32
      if (extraCount > 32) {
        //we're adding a lot of messages, no point in even keeping old chatLog, instead replace entirely with the last 32 sent messages
        this.chatLog = this.bufferedChatMessages.slice(this.bufferedChatMessages.length - 32)
      } else {
        if (extraCount > 0) {
          //we're adding enough messages to overflow the chatLog limit of 32, let's splice the start of the array to make it short enough, then push new messages to the end
          this.chatLog.splice(0, extraCount)
        }
        //add new messages to the end
        this.chatLog.push(...this.bufferedChatMessages)
      }
      
      this.bufferedChatMessages = []
    }
    this.bufferedNotifications = []
  }

  broadcastBuffer(buffer) {
    this.server.wsServer.publish(this.wsTopic, buffer.buffer, true)
  }

  sendChat(participant, message) {
    let time = Date.now()
    let writer = new BinaryWriter()
    writer.writeUInt8(0x07)
    writer.writeVarlong(participant.id)
    writer.writeVarlong(time)
    writer.writeString(message)
    this.tickBroadcasts.push(writer.getBuffer())
    
    writer = new BinaryWriter()
    writer.writeBuffer(participant.user.getInfo())
    writer.writeVarlong(time)
    writer.writeString(message)
    this.addToChatLog.push(writer.getBuffer())
  }

  sendNotes(participant, notesBuffer) {
    let writer = new BinaryWriter()
    writer.writeUInt8(0x08)
    writer.writeVarlong(participant.id)
    writer.writeBuffer(notesBuffer)
    this.tickBroadcasts.push(writer.getBuffer())
  }

  participantUpdated(participant) {
    this.participantUpdates.add(participant)
  }

  setSettings(set) {
    Object.assign(this.settings, set)
    if (!set.color2) delete this.settings.color2
    this.updateSettings = true
  }

  ban(banner, banned, ms) {
    this.bans.set(banned.id, Date.now() + ms)
    let participant = this.participantsBy_id.get(banned.id)
    if (participant) {
      participant.broadcastArray([{
        m: "notification",
        title: "Notice",
        text: `Banned from ${this.id} for ${Math.floor(ms / 60000)} minutes.`,
        duration: 7000,
        target: "#room",
        class: "short"
      }])
    }
    if (participant) {
      let testAwkward = this.server.getOrCreateChannel("test/awkward")
      for (let client of participant.clients.values()) {
        client.setChannel(testAwkward)
      }
    }
    this.bufferedNotifications.push({
      m: "notification",
      title: "Notice",
      text: `${banner.data.name} banned ${banned.data.name} from the channel for ${Math.floor(ms / 60000)} minutes.`,
      duration: 7000,
      target: "#room",
      class: "short"
    })
    if (banned.id === this.crown.userId) this.bufferedNotifications.push({
      m: "notification",
      title: "Certificate of Award",
      text: `Let it be known that ${banned.data.name} kickbanned him/her self.`,
      duration: 7000,
      target: "#room"
    })
  }

  getSettings() {
    let writer = new BinaryWriter()
    let bitflags = 0
    if (this.settings.lobby) bitflags = bitflags | 0b1
    if (this.settings.visible) bitflags = bitflags | 0b10
    if (this.settings.chat) bitflags = bitflags | 0b100
    if (this.settings.crownsolo) bitflags = bitflags | 0b1000
    if (this.settings["no cussing"]) bitflags = bitflags | 0b10000
    if (this.settings.color2) bitflags = bitflags | 0b100000
    writer.writeUInt8(bitflags)
    writer.writeColor(this.settings.color)
    if (this.settings.color2) writer.writeColor(this.settings.color2)
    return writer.getBuffer() 
  }

  getCrown() {
    let writer = new BinaryWriter()
    writer.writeUserId(this.crown.userId)
    if (this.crown.dropped) {
      writer.writeUInt8(0b1)
      writer.writeVarlong(this.crown.time)
      writer.writeUInt16(this.crown.startX)
      writer.writeUInt16(this.crown.startY)
      writer.writeUInt16(this.crown.endX)
      writer.writeUInt16(this.crown.endY)
    } else {
      writer.writeUInt8(0b0)
    }
    return writer.getBuffer()
  }
}