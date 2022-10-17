import { stringToArrayBuffer } from "./util.js"
import { BinaryWriter } from "./binary.js"

export class Participant {
  constructor(channel, user, id) {
    this.channel = channel
    this.user = user
    this.clients = new Set()
    this.x = 65535
    this.y = 65535

    //keep track of what has changed since the last tick so we send as little as possible in updates
    this.updateEverything = true
    this.nameChanged = false
    this.colorChanged = false
    this.mouseChanged = false

    this.id = id

    this.user.addParticipant(this)
  }

  addClient(client) {
    this.clients.add(client)
  }

  removeClient(client) {
    this.clients.delete(client)
    if (this.clients.size === 0) {
      this.channel.removeParticipant(this)
      this.user.removeParticipant(this)
    }
  }

  getFullInfo() {
    let writer = new BinaryWriter()
    writer.writeVarlong(this.id)
    writer.writeBuffer(this.user.getInfo())
    writer.writeUInt16(this.x)
    writer.writeUInt16(this.y)
    return writer.getBuffer()
  }

  //no mouse, used in chat messages
  getPartialInfo() {
    let object = this.user.getInfo()
    object.id = this.id
    return object
  }

  //resets update state
  getUpdate() {
    let updateName = false
    let updateColor = false
    let updateMouse = false
    if (this.nameChanged) {
      updateName = true
      this.nameChanged = false
    }
    if (this.colorChanged) {
      updateColor = true
      this.colorChanged = false
    }
    if (this.mouseChanged) {
      updateMouse = true
      this.mouseChanged = false
    }
    if (this.updateEverything) {
      updateName = true
      updateColor = true
      updateMouse = true
      this.updateEverything = false
    }
    let writer = new BinaryWriter()
    writer.writeVarlong(this.id)
    let bitflags = 0
    if (updateName) bitflags = bitflags | 0b1
    if (updateColor) bitflags = bitflags | 0b10
    if (updateMouse) bitflags = bitflags | 0b100
    writer.writeUInt8(bitflags)
    if (updateName) writer.writeString(this.user.data.name)
    if (updateColor) writer.writeColor(this.user.data.color)
    if (updateMouse) {
      writer.writeUInt16(this.x)
      writer.writeUInt16(this.y)
    }
    return writer.getBuffer()
  }

  setMousePos(x, y) {
    this.x = x
    this.y = y
    this.mouseChanged = true
    this.channel.participantUpdated(this)
  }

  userDataChanged(nameChanged, colorChanged) {
    if (nameChanged) this.nameChanged = true
    if (colorChanged) this.colorChanged = true
    this.channel.participantUpdated(this)
  }

  broadcastArray(json) {
    let buffer = stringToArrayBuffer(JSON.stringify(json))
    //no pub/sub, this is very rarely used so it's not worth it
    for (let client of this.clients.values()) {
      client.ws.send(buffer, false)
    }
  }
}