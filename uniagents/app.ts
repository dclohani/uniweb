const fss = require('fs');
var app = require('express')();

var http = require('http').createServer(app);
var https = require('https').createServer({ key: fss.readFileSync('./privatekey.key'), cert: fss.readFileSync('./certificate.crt') }, app);
var io = require('socket.io')(http, {
    cors: {
        origin: "http://localhost:51670",
        methods: ["GET", "POST"],
        credentials: true
    },
    allowEIO3: true 
});
var ios = require('socket.io')(https);
const signalR = require("@microsoft/signalr");
var env = process.env.NODE_ENV || 'development';
var config = require('./Config')[env];

var sock_array = [];
var ChatsResources;
var chatList;
var sessionTimerId;

try {
    ChatsResources = require("./UniChat.js");
    chatList = new ChatsResources.ChatList();
    sessionTimerId = setInterval(sessionTimer, config.timer.chat_health);
}
catch (ex) {
    let ts = Date.now();

    console.log(getdate() + '\t' + 'ERROR: ' + ex);
}

function sessionTimer() {
    clearInterval(sessionTimerId);
    chatList.checkActiveSessions();
    sessionTimerId = setInterval(sessionTimer, config.timer.chat_health);
};


var myVar;
var bodyParser = require('body-parser')

//var chatRoom = new ChatsResources.ChatRoom('100', '1234');
//chatRoom.AddParticipiant('deepak', null);
//chatRoom.AddParticipiant('mohit', null);
//chatList.addRoom(chatRoom);
//var room = chatList.getRoom('101');
//console.log("Participiant :" + ((room == null) ? "Not Found" : room.roomId));

function getdate() {
    let date_ob = new Date();
    // current date
    // adjust 0 before single digit date
    let date = ("0" + date_ob.getDate()).slice(-2);
    // current month
    let month = ("0" + (date_ob.getMonth() + 1)).slice(-2);
    // current year
    let year = date_ob.getFullYear();
    // current hours
    let hours = date_ob.getHours();
    // current minutes
    let minutes = date_ob.getMinutes();
    // current seconds
    let seconds = date_ob.getSeconds();
    let current_date = year + "-" + month + "-" + date + " " + hours + ":" + minutes + ":" + seconds
    return current_date
}

app.use(bodyParser.json());       // to support JSON-encoded bodies
app.use(bodyParser.urlencoded({     // to support URL-encoded bodies
    extended: true
})); 


//app.route('/Node').get(
//    function (req, res)
//        { res.send('hello how are you') }
//);
app.get('/lockroom', function (req, res) {
    //res.sendFile(__dirname + '/index.html');
    //res.send('hello how are you')
    console.log(getdate() + '\t' + 'lockroom for: ' + req.body.payload.room);
    var picked = sock_array.find(o => o.session === req.body.session);
    if (picked == null) {
        console.log(getdate() + '\t' + 'connection does not exist in arry for session: ' + req.body.session);
        var retval = { "result": "FAILED" };
        res.send(result);
    }
    lock_chat_room(req.body, picked);
    var retval = { "result": "SUCCESS" };
    var result = JSON.stringify(retval);
    res.send(result);
});

app.get('/getrooms', function (req, res) {
    //res.sendFile(__dirname + '/index.html');
        //res.send('hello how are you')
    var retval = chatList.getroomlist();
    var result = JSON.stringify(retval); 
    res.send(result);
});

app.post('/getparticipiant', function (req, res) {
    //res.sendFile(__dirname + '/index.html');
    //res.send('hello how are you')
    console.log(getdate() + '\t' + 'getparticipiant for: ' + req.body.room);

    var retval = chatList.getpartlist(req.body.room);
    var result = JSON.stringify(retval);
    res.send(result);
});

// POST method route
app.post('/', function (req, res) {
    //var user_name = req.headers.
    //req.body
    try
    {
        var xx = getdate()
        var serverobj = sock_array.find(o => o.type === "client");
        if (serverobj != null && serverobj.socket != null)
        {
            var msg = '{ "type": "client", "message": "action","session":' + JSON.stringify(req.body.session) + ',"payload":' + JSON.stringify(req.body) + ' }';
            console.log(getdate() + '\t' + 'sending to server: ' + msg);
            serverobj.socket.emit('chat_message', msg)
            res.send('SUCCESS');
        }
        else
        {
            res.send('FAILED');
        }
    
    }
    catch (ex) {
        let ts = Date.now();

        console.log(getdate() + '\t' + 'ERROR: ' + ex);
    }
 
});

function myTimer() {
    try {
        clearInterval(myVar)
        var serverobj = sock_array.find(o => o.type === "server");
        for (let i = 0; i < sock_array.length; i++) {
            if (sock_array[i].type == "client") {

                if (serverobj != null && serverobj.socket != null) {
                    if (sock_array[i].init_flag == 0) {
                        sock_array[i].initpacket(serverobj)
                    }
                }
            }
        }
        myVar = setInterval(myTimer, config.timer.client_health);
    }

    catch (ex) {
        console.log(getdate() + '\t' + 'ERROR: ' + ex);
    }
}


io.on('connection', ioHandler);
ios.on('connection', ioHandler);

function ioHandler (socket) {
    try {
        console.log(getdate() + '\t' + 'a user connected: ' + socket.handshake.address);
        var sock_obj = {
            "type": "client",
            "agent": "",
            "session": "",
            "socket": socket,
            "init_flag": 0,
            "counter": 0,
            "category": 0,
            "initpacket": function (serverobj) {
                var jsonObject = { type: "client", message: "getstatus", agent: this.agent, session: this.session, counter: this.counter++}
                var msg = JSON.stringify(jsonObject)
                console.log(getdate() + '\t' + 'sending to server1 [' + this.init_flag.toString()+']: ' + msg);
                serverobj.socket.emit('chat_message', msg)
                if (this.counter > 100000)
                    this.counter = 1;
            },
            "chat_init": 0
        }
        sock_array.push(sock_obj)

        socket.on('base64 file', function (msg) {
            console.log('received base64 file from' + msg.username);
            //io.sockets.emit('base64 file',  //include sender
            //    {
            //        username: socket.username,
            //        file: msg.file,
            //        fileName: msg.fileName
            //    }
            //);

            // Remove header
            let base64Image = msg.file.split(';base64,').pop();
            fs.writeFile(msg.fileName, base64Image, { encoding: 'base64' }, function (err) {
                console.log('File created');
            });
            
        });

        //Chat message Handling
        socket.on('chat_tx_message', function (msg) {
            console.log(getdate() + '\t' + 'chat_tx_message: ' + msg);
            try {
                var picked = sock_array.find(o => o.socket === socket);
                if (picked != null) {
                    var jsonObject = JSON.parse(msg);
                    if (jsonObject.type == "client") {
                        console.log(getdate() + '\t' + "client packet");
                         if (jsonObject.message == "vconf_url" || jsonObject.message == "conf_url") {
                            for (let i = 0; i < sock_array.length; i++) {
                                if (sock_array[i].type == "client") {

                                    if (sock_array[i].agent != jsonObject.touser)
                                        continue
                                    sock_array[i].socket.emit('chat_message', msg);
                                    return;
                                }
                            }
                        }
                         else if (jsonObject.message == "vconf_start" || jsonObject.message == "vconf_stop") {
                            for (let i = 0; i < sock_array.length; i++) {
                                if (sock_array[i].type == "client") {

                                    if (sock_array[i].category != 1)
                                        continue
                                    sock_array[i].socket.emit('chat_message', msg);
                                    return;
                                }
                            }
                        }
                    }
                }
            }
            catch (ex) {
                console.log(getdate() + '\t' + 'chat_conv_message ERROR: ' + ex);
            }
        });

        socket.on('chat_message', function (msg) {
            console.log(getdate() + '\t' + 'message: ' + msg);

            try {
                var picked = sock_array.find(o => o.socket === socket);
                console.log(getdate() + '\t' + "length: " + sock_array.length);
                if (picked != null) {
                    var jsonObject = JSON.parse(msg);
                    if (jsonObject.type == "client") {
                        console.log(getdate() + '\t' + "client packet");
                        if (jsonObject.message == "initpacket") {
                            picked.type = "client"
                            picked.agent = jsonObject.agent
                            try {
                                if (jsonObject.category == 1)
                                    picked.category = 1
                            }
                            catch (ex) {

                            }
                            
                            picked.session = jsonObject.session
                        }
                        if (jsonObject.message == "conv_init") {
                            picked.chat_init = 1
                        }
                        else {
                            var serverobj = sock_array.find(o => o.type === "server");
                            if (serverobj && serverobj.socket) {
                                console.log(getdate() + '\t' + 'sending to server2: ' + msg);
                                serverobj.socket.emit('chat_message', msg)
                            }
                        }
                    }
                    else if (jsonObject.type == "server") {
                        console.log(getdate() + '\t' + "server packet");
                        if (jsonObject.message == "initpacket") {
                            picked.type = "server";
                            picked.session = jsonObject.session;
                        }
                           
                        else {
                            //link user message
                            if (jsonObject.session.length <= 0) {
                                var clientobj = sock_array.find(o => o.session === jsonObject.payload.session);
                                if (clientobj != null && clientobj.socket != null) {
                                    var jsonObject = JSON.parse(msg);
                                    chat_response(jsonObject, clientobj);
                                }
                            }
                            else {
                                var clientobj = sock_array.find(o => o.session === jsonObject.session);
                                if (clientobj != null && clientobj.socket != null) {
                                    console.log(getdate() + '\t' + 'sending to client: ');
                                    var jsonObject = JSON.parse(msg);
                                    var response = JSON.stringify(jsonObject)
                                    console.log(getdate() + '\t' + response);
                                    clientobj.socket.emit('chat_message', response)
                                    clientobj.init_flag = 1
                                }
                            }
                        }
                    }
                    //socket.emit('chat_message', msg);
                }
            }
            catch (ex) {
                console.log(getdate() + '\t' + 'chat_message ERROR: ' + ex);
            }
        });

        socket.on('unichat_message', function (msg) {
            console.log(getdate() + '\t' + 'unichat_message: ' + msg);

            try {
                var picked = sock_array.find(o => o.socket === socket);
                console.log(getdate() + '\t' + "length: " + sock_array.length);
                if (picked != null) {
                    var jsonObject = JSON.parse(msg);
                    if (jsonObject.type == "client") {
                        console.log(getdate() + '\t' + "client packet");
                        unichat_message_proc(picked, msg);
                    }
                 }
            }
            catch (ex) {
                console.log(getdate() + '\t' + 'chat_message ERROR: ' + ex);
            }
        });

        //{"action" : "ChatRoomLock","room" : "" }
        socket.on('av_action', function (msg) {
            try {
                //console.log('av_action: ', msg);
                var picked = sock_array.find(o => o.socket === socket);
                if (picked == null) {
                    console.log(getdate() + '\t' + 'connection does not exist in arry: ' + msg);
                    return;
                }
                var jsonObject = JSON.parse(msg);
                var user = jsonObject.user;
                var session = jsonObject.session;
                var payload = jsonObject.payload;
                if (payload.action == "CreateVideoCall") {
                    var roomId = payload.room;
                    var sdpOffer = payload.sdpOffer;
                    var room = chatList.getRoom(payload.room);
                    if (room == null) {
                        console.log(getdate() + '\t' + 'room is not available ' + roomId);
                        return;
                    }
                    room.CreateVideoCall(picked.session, payload.sdpOffer, sock_array)
                }
                else if (payload.action == "HangupVideoCall") {
                    var roomId = payload.room;
                    var room = chatList.getRoom(payload.room);
                    if (room == null) {
                        console.log(getdate() + '\t' + 'room is not available ' + roomId);
                        return;
                    }
                    room.HangupVideoCall(picked.session, payload.peerhangup, sock_array)
                }
                else if (payload.action == "AVAccept") {
                    var roomId = payload.room;
                    var sdpOffer = payload.sdpOffer;
                    var room = chatList.getRoom(payload.room);
                    if (room == null) {
                        console.log(getdate() + '\t' + 'room is not available ' + roomId);
                        return;
                    }
                    room.AcceptVideoCall(picked.session, payload.sdpOffer, sock_array)
                }
                else if (payload.action == "AVReject") {
                    var roomId = payload.room;
                    var sdpOffer = payload.sdpOffer;
                    var room = chatList.getRoom(payload.room);
                    if (room == null) {
                        console.log(getdate() + '\t' + 'room is not available ' + roomId);
                        return;
                    }
                    room.RejectVideoCall(picked.session, payload.sdpOffer, sock_array)
                }
                else if (payload.action == "ExgIceCandidates") {
                    var roomId = payload.room;
                    var sdpOffer = payload.sdpOffer;
                    var room = chatList.getRoom(payload.room);
                    if (room == null) {
                        console.log(getdate() + '\t' + 'room is not available ' + roomId);
                        return;
                    }
                    room.ExgIceCandidates(picked.session, payload.candidate, sock_array)
                }
                else if (payload.action == "StartVideoRecord") {
                    var roomId = payload.room;
                    var room = chatList.getRoom(payload.room);
                    if (room == null) {
                        console.log(getdate() + '\t' + 'room is not available ' + roomId);
                        return;
                    }
                    room.StartVideoRecord(picked.session, payload.filename, sock_array)
                }
                else if (payload.action == "StopVideoRecord") {
                    var roomId = payload.room;
                    var room = chatList.getRoom(payload.room);
                    if (room == null) {
                        console.log(getdate() + '\t' + 'room is not available ' + roomId);
                        return;
                    }
                    room.StopVideoRecord(picked.session,  sock_array)
                }
            }
            catch (ex) {
                console.log(getdate() + '\t' + 'av_action ERROR: ' + ex);
            }
        });

        socket.on('chat_action', function (msg) {
            //console.log(getdate() + '\t' + 'message: ' + msg);
            try {
                var picked = sock_array.find(o => o.socket === socket);
                if (picked == null) {
                    console.log(getdate() + '\t' + 'connection does not exist in arry: ' + msg);
                    return;
                }
                var jsonObject = JSON.parse(msg);
                var user = jsonObject.user;
                var session = jsonObject.session;
                var payload = jsonObject.payload;
                if (payload.action == "LockChatRoom") {

                    lock_chat_room(jsonObject, picked);
                }
                else if (payload.action == "JoinChatRoom") {
                    var roomId = payload.room;
                    var room = chatList.getRoom(payload.room);
                    if (room == null) {
                        console.log(getdate() + '\t' + 'room is not available ' + roomId);
                        return;
                    }
                    room.AddParticipiant(user, picked.session, picked.category)
                    dumpChatAction("JoinChatRoom", { "room": room.roomId, "participiant": user, "sessionid": picked.session });
                }
                else if (payload.action == "LeaveChatRoom") {
                    leave_chat_room(jsonObject, picked);
                }
                else if (payload.action == "DestroyChatRoom") {
                    var roomId = payload.room;
                    var room = chatList.getRoom(payload.room);
                    if (room == null) {
                        console.log(getdate() + '\t' + 'room is not available ' + roomId);
                        return;
                    }
                    if (room.GetOwner() != picked.session) {
                        console.log(getdate() + '\t' + 'permission denied to destroy romm ' + roomId);
                        leave_chat_room(jsonObject, picked);
                        return;
                    }
                    room.removeRoom(jsonObject.name, picked.session)
                    dumpChatAction("DestroyChatRoom", room);
                }
                else if (payload.action == "chatmedia") {
                    var roomId = payload.room;
                    var room = chatList.getRoom(payload.room);
                    if (room == null) {
                        console.log(getdate() + '\t' + 'room is not available ' + roomId + " Creating room again");
                        lock_chat_room(jsonObject, picked);
                        return;
                    }
                    room.BroadcastMessage(picked.session, payload.data, sock_array);
                }
                else if (payload.action == "StartRemoteChat") {
                    var roomId = payload.room;
                    var room = chatList.getRoom(payload.room);
                    if (room == null) {
                        console.log(getdate() + '\t' + 'room is not available ' + roomId);
                        return;
                    }
                    room.RemoteVideoControl(picked.session, JSON.stringify(payload.data), sock_array)
                }
                else if (payload.action == "StopRemoteChat") {
                    var roomId = payload.room;
                    var room = chatList.getRoom(payload.room);
                    if (room == null) {
                        console.log(getdate() + '\t' + 'room is not available ' + roomId);
                        return;
                    }
                    room.RemoteVideoControl(picked.session, payload.data, sock_array)
                }
                else if (payload.action == "UploadFile") {
                    var roomId = payload.room;
                    var room = chatList.getRoom(payload.room);
                    if (room == null) {
                        console.log(getdate() + '\t' + 'room is not available ' + roomId);
                        return;
                    }
                    try {
                        //SaveUploadedFile(payload.data);
                        room.UploadFileLink(picked.session, payload.data, sock_array)
                    }
                    catch (ex) {
                        console.log(getdate() + '\t' + 'SaveUploadedFile ERROR: ' + ex);
                    }
                }
                else if (payload.action == "CreateVideoCall") {
                    var roomId = payload.room;
                    var sdpOffer = payload.sdpOffer;
                }
            }
            catch (ex) {
                console.log(getdate() + '\t' + 'chat_action ERROR: ' + ex);
            }
        });

        function SaveUploadedFile(msg) {
            console.log('received base64 file from' + msg.username);
            let base64Image = msg.file.split(';base64,').pop();
            fs.writeFile(config.file_download_folder +  msg.fileName, base64Image, { encoding: 'base64' }, function (err) {
                console.log('File created');
            });
        }

        //Lock Chat toom

        function leave_chat_room(jsonObject, picked) {
            var user = jsonObject.user;
            var payload = jsonObject.payload;

            var roomId = payload.room;
            var room = chatList.getRoom(payload.room);
            if (room == null) {
                console.log(getdate() + '\t' + 'room is not available ' + roomId);
                return;
            }
            room.RemoveParticipiant(user, picked.session)
            dumpChatAction("LeaveChatRoom", { "room": room.roomId, "participiant": user, "sessionid": picked.session });
        }

        function unichat_message_proc(obj, msg) {

        }

        //dump chat action

        function chat_response(jsonObject, picked) {
            try {
                var payload = jsonObject.payload;
                var user = payload.user;
                var session = payload.session;
                var serverobj = sock_array.find(o => o.type === "server");
                if (payload.response == "waitagent") {

                    var roomId = payload.room;
                    var room = chatList.getRoom(payload.room);
                    if (room == null) {
                        console.log(getdate() + '\t' + 'room is not available ' + roomId);
                        return;
                    }
                    room.BroadcastMessage(serverobj.session, {"content": "Agents are not available right now"}, sock_array);
                }
            }
            catch (ex) {
                console.log(getdate() + '\t' + 'dumpChatResponse ERROR: ' + ex);
            }

        }

        socket.on('disconnect', function () {
            try {
                console.log(getdate() + '\t' + 'user disconnected: ' + socket.handshake.address);
                if (socket == null) {
                    console.log(getdate() + '\t' + 'undefined socket ');
                }
                var picked = sock_array.find(o => o.socket === socket);
                if (picked) {
                    console.log(getdate() + '\t' + 'Disconnected user: ' + picked.agent);
                }
                sock_array = sock_array.filter(o => o.socket != socket);
                if (picked.type == "server") {
                    for (let i = 0; i < sock_array.length; i++) {
                        sock_array[i].socket.disconnect();
                    }
                }
                else if (picked.type == "client") {
                    var serverobj = sock_array.find(o => o.type === "server");
                    //socket.emit('chat_message', '{"type": "client", "message": "getstatus", "agent": "' + user_id + '", "session": "@Session["SessionID"].ToString()"}');
                    var jsonObject = { type: "client", message: "disconnect", agent: picked.agent, session: picked.session }
                    var response = JSON.stringify(jsonObject)
                    // serverobj.socket.emit('chat_message', response)
                    if (picked.chat_init == 1)
                        chatList.removeSession(picked.session)
                }
                //console.log('Type: ' + );

            }
            catch (ex) {
                console.log(getdate() + '\t' + 'disconnect ERROR: ' + ex);
            }

        });
    }
    catch (ex) {
        console.log(getdate() + '\t' + 'io connection ERROR: ' + ex);
    }

};

function lock_chat_room(jsonObject, picked) {
    var user = jsonObject.user;
    var payload = jsonObject.payload;

    var roomId = payload.room;
    var room = chatList.getRoom(payload.room);
    if (room == null) {
        console.log(getdate() + '\t' + 'room is not available so creating new one ' + roomId);
        //Create a new chat room.
        room = new ChatsResources.ChatRoom(roomId, payload.password, user, sock_array, payload.type);
        room.setName(user);
        room.SetOwner(picked.session, picked.category);
        chatList.addRoom(room);
        dumpChatAction("LockChatRoom", room);
    }
}

function dumpChatAction(action, obj) {
    try {
        var payload
        if (action == "LockChatRoom") {
            payload = {
                "action": action, "room": obj.roomId, "owner": obj.name, "sessionid": obj.owner, "createtime": getdate()
            }
        }
        else if (action == "DestroyChatRoom") {
            payload = {
                "action": action, "room": obj.roomId, "owner": obj.name, "sessionid": obj.owner, "createtime": getdate()
            }
        }
        else if (action == "JoinChatRoom") {
            payload = {
                "action": action, "room": obj.room, "participiant": obj.participiant, "sessionid": obj.owner, "createtime": getdate()
            }
        }
        else if (action == "LeaveChatRoom") {
            payload = {
                "action": action, "room": obj.room, "participiant": obj.participiant, "sessionid": obj.owner, "createtime": getdate()
            }
        }
        if (payload != null) {
            var serverobj = sock_array.find(o => o.type === "server");
            if (serverobj && serverobj.socket) {
                var message = JSON.stringify({ "message": "command", payload });
                console.log(getdate() + '\t' + 'sending to server: ' + message);
                serverobj.socket.emit('chat_rx_message', message);
            }
        }
    }
    catch (ex) {
        console.log(getdate() + '\t' + 'chat_action ERROR: ' + ex);
    }

};





//let connection = new signalR.HubConnectionBuilder()
//    .withUrl("http://127.0.0.1:51670/Signalr/chatHub", {
//        skipNegotiation: true,
//        transport: signalR.HttpTransportType.WebSocket
//    })
//    .build();
//connection.start().then(function () {
//    console.log('bbb');
//}).catch(function (err) {
//    console.log(err.toString());
//});
//connection.on("send", data => {
//    console.log(data);
//});


    

https.listen(3010, function () {
    console.log(getdate() + '\t' + 'listening on *:' + 3010);
    if (myVar == null)
        myVar = setInterval(myTimer, 100); 
});

http.listen(config.ioserver.port, function () {
    console.log(getdate() + '\t' + 'listening on *:' + config.ioserver.port);
    if (myVar == null)
        myVar = setInterval(myTimer, 100);
});

