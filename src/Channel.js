import { getChannelType } from "./util.js"
import { Participant } from "./Participant.js"
import { stringToArrayBuffer } from "./util.js"

export class Channel {
  constructor(server, id, set, creatorId) {
    this.server = server
    this.id = id

    this.settings = {
      chat: true,
      visible: true
    }
    //0: non lobby
    //1: test/ lobby
    //2: true lobby (will have 20 player limit)
    this.type = getChannelType(id)
    if (this.type > 0) {
      this.settings.color = "#73b3cc"
      this.settings.color2 = "#273546"
      this.settings.lobby = true
      this.crown = null
      this.bans = null
    } else {
      this.settings.color = "#3b5054"
      if (set) Object.assign(this.settings, set)
      this.crown = {
        startPos: {
          x: 50,
          y: 50
        },
        endPos: {
          x: 50,
          y: 50
        },
        time: Date.now(),
        userId: creatorId
      }
      this.bans = new Map()
    }

    this.participantsBy_id = new Map()
    this.participantsById = new Map()
    this.chatLog = []
    this.wsTopic = stringToArrayBuffer(`\x00${this.id}`)

    this.participantUpdates = new Set()
    this.participantRemoves = []
    this.updateChannelInfo = false
    this.bufferedChatMessages = []
    this.bufferedNotifications = []
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
      if (!this.crown.participantId) break crownChecks
      if (this.crown.userId !== participant.user.id) break crownChecks
      //if we're the last one leaving, don't announce, anyone new would know about the crown drop
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
    this.crown.participantId = participant.id
    if (!noUpdate) this.updateChannelInfo = true
  }

  dropCrown(participant) {
    delete this.crown.participantId
    this.crown.time = Date.now()
    this.crown.startPos.x = participant.x
    this.crown.startPos.y = participant.y
    this.crown.endPos.x = Math.max(10, Math.min(90, participant.x))
    this.crown.endPos.y = Math.random() * 20 + 70
    this.updateChannelInfo = true
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
    let ppl = []
    for (let participant of this.participantsBy_id.values()) {
      ppl.push(participant.getFullInfo())
    }
    return ppl
  }

  getChatLog() {
    //return undefined so there's no c property in the JSON message, saves a *tiny* amount of bandwidth
    if (this.chatLog.length === 0) return undefined
    return this.chatLog
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
    if (this.updateChannelInfo) {
      if (this.settings.visible) {
        this.server.channelUpdates.add(this)
      } else {
        this.server.channelUpdates.delete(this)
      }
    }

    if (!this.updateChannelInfo && this.participantUpdates.size === 0 && this.participantRemoves.length === 0 && this.bufferedChatMessages.length === 0 && this.bufferedNotifications.length === 0) return

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

  broadcastArray(json) {
    let buffer = stringToArrayBuffer(JSON.stringify(json))
    this.server.wsServer.publish(this.wsTopic, buffer, false)
  }

  broadcastArrayToOthers(json, client) {
    //we have to temporarily unsubscribe the client and resubscribe it after, sadly uWebSockets.js doesn't have "prepared messages" that we can send to whoever we wish
    client.ws.unsubscribe(this.wsTopic)
    this.broadcastArray(json)
    client.ws.subscribe(this.wsTopic)
  }

  sendChat(participant, message) {
    let messageObject = {
      m: "a",
      a: message,
      p: participant.getPartialInfo(),
      t: Date.now()
    }
    this.bufferedChatMessages.push(messageObject)
  }

  participantUpdated(participant) {
    this.participantUpdates.add(participant)
  }

  setSettings(set) {
    Object.assign(this.settings, set)
    if (!set.color2) delete this.settings.color2
    this.updateChannelInfo = true
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
}