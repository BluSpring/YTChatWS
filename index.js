const YouTube = require('youtubei.js');
const { Innertube, UniversalCache, YTNodes, LiveChatContinuation } = YouTube;
const config = require('./data/config.json');

const WebSocket = require('ws');
const wss = new WebSocket.Server({
    host: config.host,
    port: config.port
});

wss.on('connection', async (ws, req) => {
    let isConnected = false;
    /**
     * @type {YouTube.Innertube}
     */
    let yt;

    /**
     * @type {Map<string, YouTube.YT.LiveChat>}
     */
    const connectedChats = new Map();

    ws.on('error', e => {
        console.error(`An error occurred on WebSocket client ${req.socket.address().address}:${req.socket.address().port}!`);
        console.error(e.stack ?? e.message);
    });

    ws.on('close', (code, reason) => {
        for (const [_, chat] of connectedChats) {
            chat.stop();
        }
    });

    ws.on('open', () => {
        setTimeout(() => {
            if (!isConnected) {
                ws.close(4000, `You didn't authenticate in time!`);
            }
        }, 3_500);
    });

    function send(op, data) {
        //console.log(op, data);
        ws.send(JSON.stringify({
            op,
            d: data
        }));
    }

    ws.on('message', async (d) => {
        try {
            const str = d.toString('utf8');
            const data = JSON.parse(str);

            if (data.op != 'login' && !isConnected) {
                ws.close(4000, `You aren't authenticated!`);
                return;
            }

            switch (data.op) {
                case 'login': {
                    if (data.d.password != config.password) {
                        ws.close(4000, `Invalid password!`);

                        return;
                    }

                    isConnected = true;
                    yt = await Innertube.create({
                        cache: new UniversalCache(false),
                        generate_session_locally: true
                    });


                    send('login_ack', {});

                    break;
                }

                case 'get_streams': {
                    const channel = await yt.getChannel(data.d.id);
                    await channel.getLiveStreams();
                    const streams = channel.videos.filter(a => a.is_live && !a.is_premiere);

                    send('streams_list', {
                        id: data.d.id,
                        streams: streams.map(a => a.id)
                    });

                    break;
                }

                case 'disconnect': {
                    if (!connectedChats.has(data.d.id))
                        return;

                    connectedChats.get(data.d.id).stop();
                    connectedChats.delete(data.d.id);

                    break;
                }

                case 'connect': {
                    try {
                        if (connectedChats.has(data.d.id))
                            return;

                        const info = await yt.getInfo(data.d.id);
                        const chat = info.getLiveChat();

                        connectedChats.set(data.d.id, chat);

                        chat.on('start', (initial) => {
                            let emojis = [];

                            for (const emoji of initial.emojis) {
                                emojis.push({
                                    id: emoji.emoji_id,
                                    images: emoji.image
                                });
                            }

                            send('connected', {
                                id: data.d.id,
                                emojis
                            });
                        });

                        chat.on('error', e => {
                            send('error', {
                                op: 'chat',
                                id: data.d.id,
                                message: e.message ?? e.toString()
                            });

                            console.error(`An error occurred on WebSocket client ${req.socket.address().address}:${req.socket.address().port}, under YT chat ID ${data.d.id}!`);
                        });

                        chat.on('end', () => {
                            send('disconnected', {
                                id: data.d.id
                            });
                        });

                        chat.on('chat-update', (action) => {
                            if (action.is(YTNodes.AddChatItemAction)) {
                                const item = action.as(YTNodes.AddChatItemAction).item;
                                const timestamp = item.hasKey('timestamp') ? item.timestamp : Date.now();

                                switch (item.type) {
                                    case 'LiveChatTextMessage': {
                                        const msg = item.as(YTNodes.LiveChatTextMessage);
                                        const badges = new Set();

                                        if (msg.author?.is_moderator)
                                            badges.add('moderator');

                                        if (msg.author?.is_verified)
                                            badges.add('verified');

                                        const b = msg.author?.badges.as(YTNodes.LiveChatAuthorBadge);

                                        if (!!b) {
                                            for (const badge of b) {
                                                if (!badge.icon_type)
                                                    continue;

                                                badges.add({
                                                    id: badge.icon_type,
                                                    icons: badge.custom_thumbnail,
                                                    style: badge.style
                                                });
                                            }
                                        }

                                        const name = msg.author?.name;
                                        const message = msg.message.text;
                                        const messageHtml = msg.message.toHTML();

                                        send('chat', {
                                            id: data.d.id,
                                            timestamp,
                                            author: {
                                                name,
                                                badges: [...badges]
                                            },
                                            message,
                                            messageHtml
                                        });
                                        
                                        break;
                                    }
                                }
                            }
                        });

                        chat.start();
                    } catch (e) {
                        send('error', {
                            op: 'connect',
                            message: e.message ?? e.toString()
                        });
                    }

                    break;
                }
            }
        } catch (e) {
            console.error(`An error occurred on WebSocket client ${req.socket.address().address}:${req.socket.address().port}!`);
            ws.close(4001, `An internal error occurred!`);
        }
    });
});

wss.on('listening', () => {
    console.log(`YT chat server opened and running on ${config.host}:${config.port}!`);
});

wss.on('error', (e) => {
    console.error(`An error occurred in the WebSocket server!`);
    console.error(e.stack ?? e.message);
});