import { messageHandlers } from "./messages.js"
import { incrementLobby, arrayBufferToString, stringToArrayBuffer } from "./util.js"

export class Client {
  constructor(server, ws) {
    this.server = server
    this.ws = ws
    this.ip = ws.ip
    this.user = null
    this.channel = null
    this.participant = null

    this.channelListSubscribed = false

    this.destroyed = false
  }

  destroy() {
    if (this.destroyed) return
    this.destroyed = true
    if (!this.ws.closed) this.ws.end()
    if (this.participant) this.participant.removeClient(this)
    if (this.user) this.user.removeClient(this)
    this.server.removeClient(this)
  }

  handleMessage(message, isBinary) {
    if (isBinary) return
    let parsed
    try {
      parsed = JSON.parse(arrayBufferToString(message))
    } catch (error) {
      console.log(error)
      return
    }
    if (!Array.isArray(parsed)) return
    for (let messageObject of parsed) {
      messageHandlers[messageObject?.m]?.(this, messageObject)
    }
  }

  setUser(user) {
    this.user = user
    user.addClient(this)
  }
  
  sendArray(json) {
    let buffer = stringToArrayBuffer(JSON.stringify(json))
    this.ws.send(buffer, false)
  }

  trySetChannel(id, set) {
    let channel = this.server.getOrCreateChannel(id, set, this.user.id)
    if (channel.type === 1) {
      //is test/
      this.setChannel(channel)
    } else if (channel.type === 2) {
      //is true lobby
      if (channel.isFull()) {
        this.trySetChannel(incrementLobby(id))
        return
      }
      this.setChannel(channel)
    } else {
      //is non lobby
      let banDuration = channel.isBanned(this.user.id)
      if (banDuration) {
        this.sendArray([{
          m: "notification",
          title: "Notice",
          text: `Currently banned from ${id} for ${Math.ceil(banDuration / 60000)} minutes.`,
          duration: 7000,
          target: "#room",
          class: "short"
        }])
        this.setChannel(this.server.getOrCreateChannel("test/awkward"))
        return
      }
      this.setChannel(channel)
    }
  }

  setChannel(channel) {
    if (this.channel) {
      if (this.channel === channel) return
      this.ws.unsubscribe(this.channel.wsTopic)
      this.participant.removeClient(this)
    }
    let participant = channel.getOrCreateParticipant(this.user)
    participant.addClient(this)
    this.channel = channel
    this.participant = participant
    this.ws.subscribe(this.channel.wsTopic)
    this.sendArray([{
      m: "ch",
      ch: channel.getInfo(),
      p: this.participant.id,
      ppl: channel.getPpl()
    },
    {
      m: "c",
      c: channel.getChatLog()
    }])
  }

  channelListSubscribe() {
    this.channelListSubscribed = true
    this.ws.subscribe(this.server.channelListTopic)
    this.ws.send(this.server.getFullChannelListMsg())
  }

  channelListUnsubscribe() {
    this.channelListSubscribed = false
    this.ws.unsubscribe(this.server.channelListTopic)
  }
}