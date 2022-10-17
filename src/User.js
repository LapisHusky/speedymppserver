import { data } from "./data.js"
import { BinaryWriter } from "./binary.js"

export class User {
  constructor(server, id, color) {
    this.server = server
    this.id = id
    if (data.userData[id]) {
      this.data = data.userData[id]
    } else {
      this.data = {
        name: "Anonymous",
        color
      }
      data.userData[id] = this.data
    }
    this.clients = new Set()
    this.participants = new Set()
  }

  addClient(client) {
    this.clients.add(client)
  }

  removeClient(client) {
    this.clients.delete(client)
    if (this.clients.size === 0) {
      this.server.removeUser(this)
    }
  }

  getInfo() {
    let writer = new BinaryWriter()
    writer.writeUserId(this.id)
    writer.writeString(this.data.name)
    writer.writeColor(this.data.color)
    return writer.getBuffer()
  }

  addParticipant(participant) {
    this.participants.add(participant)
  }

  removeParticipant(participant) {
    this.participants.delete(participant)
  }

  setData(name, color) {
    let nameChanged = false
    let colorChanged = false
    if (name !== null && name !== this.data.name) {
      nameChanged = true
      this.data.name = name
    }
    if (color !== null && color !== this.data.color) {
      colorChanged = true
      this.data.color = color
    }
    if (!nameChanged && !colorChanged) return
    for (let participant of this.participants.values()) {
      participant.userDataChanged(nameChanged, colorChanged)
    }
  }
}