import { messageHandlers } from "./messages.js"
import { incrementLobby, arrayBufferToString, stringToArrayBuffer } from "./util.js"
import { BinaryReader, BinaryWriter } from "./binary.js"

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
    if (!isBinary) return
    let reader = new BinaryReader(Buffer.from(message))
    while (!reader.reachedEnd()) {
      let opcode = reader.readUInt8()
      if (!messageHandlers[opcode]) return
      messageHandlers[opcode](this, reader)
    }
  }

  setUser(user) {
    this.user = user
    user.addClient(this)
  }
  
  sendBuffer(buffer) {
    this.ws.send(buffer.buffer, true)
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
        let writer = new BinaryWriter()
        writer.writeUInt8(0x06)
        writer.writeUInt8(0x01)
        writer.writeVarlong(banDuration)
        writer.writeString(id)
        this.sendBuffer(writer.getBuffer())
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
    let writer = new BinaryWriter()
    writer.writeUInt8(0x01)
    writer.writeString(channel.id)
    writer.writeBuffer(channel.getSettings())
    if (!channel.settings.lobby) writer.writeBuffer(channel.getCrown())
    writer.writeBuffer(channel.getPpl())
    writer.writeBuffer(channel.getChatLog())
    this.sendBuffer(writer.getBuffer())
  }

  channelListSubscribe() {
    this.channelListSubscribed = true
    this.ws.subscribe(this.server.channelListTopic)
    this.sendBuffer(this.server.getFullChannelListMsg())
  }

  channelListUnsubscribe() {
    this.channelListSubscribed = false
    this.ws.unsubscribe(this.server.channelListTopic)
  }
}