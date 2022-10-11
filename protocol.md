# This server's protocol

## Types
### Basic
Name | Byte length | Description
--- | --- | ---
Uint8 | 1 | Integer between 0-255
Uint16 | 2 | Integer between 0-4294967295, little endian
User ID | 12 | Arbitrary bytes, usually expressed as 24 character hexadecimal
Color | 3 | First byte is red value from 0-255, second is green, third is blue
Bitflags | 8 | 8 true/false values, with the first being the least significant bit, eighth being the most significant bit
varlong | 1 - 10 | Variable length integer. Most significant bit represents continuation, 1 for continue, 0 for not. Least significant 7 bits hold the value. Bytes order is little endian.
String | 1+ | Begins with a Varlong expressing the byte length of the string, the bytes that follow are the string's content, UTF-8 encoded
Array | 1+ | Begins with a Varlong expressing the length of the array, the elements follow directly after without any gap. Type of element is known from context

### Extended
#### Full user info
- User ID
- Color
- String (name)

#### Full participant info
- Varlong (participant ID)
- Full user info
- Uint16 (mouse x)
- Uint16 (mouse y)

#### Participant update
- Varlong (participant ID)
- Bitflags
  - Whether name is included
  - Whether color is included
  - Whether mouse position is included
- ?String (name)
- ?Color
- ?Uint16 (mouse x)
- ?Uint16 (mouse y)

#### Note
- Uint8 (note ID)
- Uint8 (velocity from 0-127 if note start, or 255 if note stop)
- Uint8 (delay from the message's base time)

#### Channel settings
- Bitflags
  - Whether the channel is a lobby
  - Whether the channel is visible
  - Whether chat is enabled
  - Whether crownsolo is enabled
  - Whether "no cussing" is enabled
  - Whether the channel has color2
- Color (inner channel color)
- ?Color (outer channel color, also known as color2)

#### Channel crown
- User ID (crown holder or last crown holder)
- Bitflags
  - Whether the crown is dropped
- ?Varlong (mmilliseconds since server startup, only if dropped)
- ?Uint16 (crown drop animation start x, only if dropped)
- ?Uint16 (crown drop animation start y, only if dropped)

#### Partial channel info
- Channel settings
- ?Channel crown (only if the channel is not a lobby)

#### Full channel info
- Partial channel info
- Varlong (current channel participant count)
- String (channel ID)

#### Partial chat message
- Varlong (participant ID)
- Varlong (timestamp message was received by server, milliseconds since server startup)
- String (message content)

#### Full chat message
- Full user info
- Varlong (timestamp message was received by server, milliseconds since server startup)
- String (message content)

#### Note broadcast
- Varlong (participant ID)
- Varlong (base message time, milliseconds since server startup)
- Array&lt;Note>

#### Kickban broadcast
- User ID
- Varlong (duration of ban, 0-3600000)

## Client -> Server Packets
Opcode | Message
--- | ---
0x00 | Authentication request
0x01 | Set channel
0x02 | Ping
0x03 | Chat
0x04 | Notes
0x05 | Move mouse
0x06 | User set
0x07 | Crown action
0x08 | Set channel settings
0x09 | Kickban
0x0a | Unban
0x0b | Channel list action

### Authentication request
- 0x00
- Bitflags
  - Whether customId property is sent
- ?Varlong (customId)

### Set channel
- 0x01
- String (channel name)
- Bitflags
  - Whether channel settings are included in this message
- ?Channel settings

### Ping
- 0x02

### Chat
- 0x03
- String (message content)

### Notes
- 0x04
- Varlong (base message time, milliseconds since server startup)
- Array&lt;Note>

### Move mouse
- 0x05
- Uint16 (mouse x)
- Uint16 (mouse y)

### User set
- 0x06
- Bitflags
  - Whether name is included
  - Whether color is included
- ?String (name)
- ?Color

### Crown action
- 0x07
- Uint8 (action ID)
  - 0x00: pick up crown
  - 0x01: drop crown
  - 0x02: give crown
- ?Varlong (participant ID to give the crown to, only if action ID is 0x02)

### Set channel settings
- 0x08
- Channel settings

### Kickban
- 0x09
- User ID
- Varlong (duration of ban, 0-3600000)

### Unban
- 0x0a
- User ID

### Channel list action
- 0x0b
- Uint8 (action ID)
  - 0x00: subscribe and request current list
  - 0x01: unsubscribe

## Server -> Client
Opcode | Message
--- | ---
0x00 | Authentication response
0x01 | Set channel
0x02 | Pong
0x03 | Channel updates
0x04 | Channel list update

### Authentication response
- 0x00
- Varlong (milliseconds since server startup)
- Full user info

### Set channel
- 0x01
- String (channel name)
- Channel settings
- ?Channel crown (only if the channel is not a lobby)
- Array&lt;Full participant info>
- Array&lt;Full chat message>

### Pong
- 0x02
- Varlong (milliseconds since server startup)

### Channel updates
- 0x03
- Bitflags
  - Whether participants were updated
  - Whether notes were sent
  - Whether chat messages were sent
  - Whether kickbans were performed
  - Whether channel settings were changed
  - Whether channel crown was changed
  - Whether participants were removed
- ?Array&lt;Participant update>
- ?Array&lt;Note broadcast>
- ?Array&lt;Partial chat message>
- ?Array&lt;Kickban broadcast>
- ?Channel settings
- ?Channel crown
- ?Array&lt;Varlong> (participant ID of removed participants)

### Channel list update
- 0x04
- Bitflags
  - Whether this includes the full channel list
  - Whether there are channel updates
  - Whether there are removed channels
- ?Array&lt;Full channel info>
- ?Array&lt;String> (channel name)