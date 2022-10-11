export class BinaryReader {
  constructor(buffer) {
    this.buffer = buffer
    this.index = 0
  }

  reachedEnd() {
    return this.index >= this.buffer.length
  }

  readUint8() {
    if (this.index >= this.buffer.length) throw new Error("Invalid buffer read")
    return this.buffer[this.index++]
  }

  readUint16() {
    if (this.index + 2 > this.buffer.length) throw new Error("Invalid buffer read")
    this.index += 2
    return this.buffer[this.index - 2]
  }

  readUserId() {
    if (this.index + 12 > this.buffer.length) throw new Error("Invalid buffer read")
    this.index += 12
    return this.buffer.toString("utf8", this.index - 12, this.index)
  }

  readColor() {
    if (this.index + 3 > this.buffer.length) throw new Error("Invalid buffer read")
    this.index += 3
    return this.buffer.toString("utf8", this.index - 12, this.index)
  }

  readBitflag(bit) {
    if (this.index >= this.buffer.length) throw new Error("Invalid buffer read")
    return this.buffer[this.index] >> bit & 0b1
  }

  readVarlong() {
    let num = this.buffer[this.index++]
    if (num < 128) return num
    let factor = 128
    while (true) {
      //we don't really need to check if this varlong is too long
      let thisValue = this.buffer[this.index++]
      if (thisValue < 128) {
        return num + thisValue * factor
      } else {
        if (this.index >= this.buffer.length) throw new Error("Invalid buffer read")
        num += (thisValue & 0b1111111) * factor
      }
      factor *= 128
    }
  }

  readString() {
    let byteLength = this.readVarlong()
    if (this.index + byteLength > this.buffer.length) throw new Error("Invalid buffer read")
    this.index += byteLength
    return this.buffer.toString("utf8", this.index - byteLength, this.index)
  }

  readBuffer(length) {
    if (this.index + length > this.buffer.length) throw new Error("Invalid buffer read")
    this.index += length
    return this.buffer.subarray(this.index - length, this.index)
  }
}

export class BinaryWriter {
  constructor() {
    this.buffers = []
  }

  writeUint8(value) {
    this.buffers.push(Buffer.alloc(1, value))
  }

  writeUint16(value) {
    let buf = Buffer.allocUnsafe(2)
    buf.writeUint16LE(value)
    this.buffers.push(buf)
  }

  writeUserId(value) {
    this.buffers.push(Buffer.from(value, "hex"))
  }

  writeColor(value) {
    this.buffers.push(Buffer.from(value, "hex"))
  }

  writeVarlong() {

  }
}