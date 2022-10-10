import { stringToArrayBuffer } from "./util.js"

export class Participant {
  constructor(channel, user, id) {
    this.channel = channel
    this.user = user
    this.clients = new Set()
    this.x = 200
    this.y = 100

    //keep track of what has changed since the last tick so we send as little as possible in updates
    this.updateEverything = true
    this.nameChanged = false
    this.colorChanged = false
    this.mouseChanged = false

    this.id = id.toString(16)

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
    let object = this.user.getInfo()
    object.id = this.id
    object.x = this.x
    object.y = this.y
    return object
  }

  //no mouse, used in chat messages
  getPartialInfo() {
    let object = this.user.getInfo()
    object.id = this.id
    return object
  }

  //resets update state
  getUpdate() {
    if (this.updateEverything) {
      this.updateEverything = false
      return this.getFullInfo()
    }
    let object = {
      id: this.id
    }
    if (this.nameChanged) {
      object.name = this.user.data.name
      this.nameChanged = false
    }
    if (this.colorChanged) {
      object.color = this.user.data.color
      this.colorChanged = false
    }
    if (this.mouseChanged) {
      object.x = this.x
      object.y = this.y
      this.mouseChanged = false
    }
    return object
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