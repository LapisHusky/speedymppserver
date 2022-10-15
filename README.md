# speedymppserver (binary)
A quotaless, partially limitless, and fast Node.js Multiplayer Piano server implementation that uses an efficient protocol and uWebSockets.js

This is the BINARY version of the server, it it not compatible with a regular MPP client unless you have a translator between the client and websocket.

This is still in early development. The JSON version of this server is ready to use in the main branch. This binary branch is not fully developed yet, and may not work in its current state. Do not contact me about getting this version to work, until it is fully developed.

## How this improves performance:
- All messages are in an optimized, custom, binary format, as opposed to JSON in every other Multiplayer Piano server. This is the first fully binary MPP server, involving a large protocol redesign.
- Sends most events at 50ms tick intervals, including mouse movements, name and color changes, participant joins, participant leaves, chat messages, and notes
  - This helps reduce bandwidth spent sending data for clients that frequently change these properties
  - Also helps reduce total message count, reducing overhead
- Sends minimal information when channel settings and crown is changed
- Broadcasts messages efficiently with uWebSockets.js using pub/sub, ensuring message building and framing is only done one time for messages that get sent to an entire channel
- Every websocket event handler is synchronous, improving performance and reducing bugs
- Participant ids are short - incrementing starting at 0 when the server is created. This once again improves bandwidth usage

## Usage
1. Install Node.js and Yarn
2. Clone or download this repo
3. Rename .env.example to .env, then configure the variables inside of it according to the comments
4. Run `yarn install` from a command prompt in the server directory
5. Run `yarn start` to start the server

This server does not serve static files. It is recommended to host MPP's static files with another service, such as NGINX, and have it proxy websocket connections through to this server. Alternatively, you can host this server on a separate domain or port than the file server.

## Notes
Because this server is made for performance testing and as a bot playground, there is a customId option in .env. If set to 1 or greater, users will be able to create x number of random IDs for themself, by sending a customId value in authentication request messages. This field's value can be anything from 1 to the number of IDs allowed by the server.

Example: `00 01 45` - this would give the user their 69th custom ID. 0 or invalid values are equivalent to not having the field at all, or give you your default ID.

This server is NOT intended to be a safe server for people to use to play the piano together or chat. It is purely meant as a playground for coders. It lacks some features such as adminmsg, saved channel data, and rate limits, all of which I have no intention of implementing later. It does, however, support most of the official server's protocol and message types.

As this is experimental, there may be bugs. Feel free to report bugs in existing features to me on Discord: Lapis#7110

If you host this publicly, please make sure to change ID_SALT in .env to a long and secret value, otherwise people will be able to brute-force IP addresses of your users.
