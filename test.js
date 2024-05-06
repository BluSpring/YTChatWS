const WebSocket = require('ws');
const config = require('./data/config.json');

const ws = new WebSocket('ws://0.0.0.0:23776');

function send(op, data) {
    console.log(op, data);
    ws.send(JSON.stringify({
        op,
        d: data
    }));
}

ws.on('open', () => {
    send('login', {
        password: config.password
    });
});

ws.on('message', (d) => {
    const data = JSON.parse(d.toString());

    console.log(data);
    
    switch (data.op) {
        case 'login_ack': {
            /*send('connect', {
                id: 'jfKfPfyJRdk'
            });*/
            send('get_streams', {
                id: 'UCSJ4gkVC6NrvII8umztf0Ow'
            });
            break;
        }
    }
}); 