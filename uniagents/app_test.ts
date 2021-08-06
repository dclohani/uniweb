const fs = require('fs');
var app = require('express')();

var http = require('http').createServer(app);

var sock_array = [];
var ChatsResources;
var chatList;
var sessionTimerId;

try {
}
catch (ex) {
    let ts = Date.now();

    console.log(getdate() + '\t' + 'ERROR: ' + ex);
}



var myVar;
var bodyParser = require('body-parser')

//var chatRoom = new ChatsResources.ChatRoom('100', '1234');
//chatRoom.AddParticipiant('deepak', null);
//chatRoom.AddParticipiant('mohit', null);
//chatList.addRoom(chatRoom);
//var room = chatList.getRoom('101');
//console.log("Participiant :" + ((room == null) ? "Not Found" : room.roomId));

function getdate2() {
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
app.get('/your/received/message/path', function (req, res) {
    console.log('get /your/received/message/path');
});

app.get('/your/received/message/path', function (req, res) {
    console.log('get2 /your/received/message/path');
   
});

app.post('post /your/received/message/path', function (req, res) {
    console.log('get /your/received/message/path');
    
});

// POST method route
app.post('/', function (req, res) {
    console.log('post /');
   

});



http.listen(5070, function () {
    console.log(getdate2() + '\t' + 'listening on *:' + 5070);
 });

