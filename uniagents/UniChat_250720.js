//var dialogFlow = require("./DialogFlow.js");
const dialogflow = require('dialogflow');
const uuid = require('uuid');
const env = process.env.NODE_ENV || 'development';
const config = require('./Config')[env];
var kurento = require('kurento-client');
var kurentoClient = null;
var pp = 0;

// Recover kurentoClient for the first time.
function getKurentoClient(callback) {
    if (kurentoClient !== null) {
        return callback(null, kurentoClient);
    }

    kurento(config.kurento_url, function (error, _kurentoClient) {
        if (error) {
            var message = 'Coult not find media server at address ' + argv.ws_uri;
            return callback(message + ". Exiting with error " + error);
        }

        kurentoClient = _kurentoClient;
        callback(null, kurentoClient);
    });
}

function CallMediaPipeline() {
    this.pipeline = null;
    this.webRtcEndpoint = {};
    this.webRtcEndpointQueue = [];
    this.hubPorts = [];
}

CallMediaPipeline.prototype.createPipeline = function (room, callback) {
    media = this;
    var webRtcEndpointQueue = this.webRtcEndpointQueue;
    var fncreateWebRtcEndpoint = this.createWebRtcEndpoint;
    getKurentoClient(function (error, kurentoClient) {
        if (error) {
            return callback(error);
        }

        kurentoClient.create('MediaPipeline', function (error, pipeline) {
            if (error) {
                return callback(error);
            }

            media.pipeline = pipeline;
           
            for (part of room.participiantArray) {
                if (part.type != 1 && part.type != 0)
                    continue;
                if (part.sdp != null)
                    webRtcEndpointQueue.push(part);
            }

            if (webRtcEndpointQueue.length > 0)
                fncreateWebRtcEndpoint(pipeline, webRtcEndpointQueue, fncreateWebRtcEndpoint, media, callback);
            
            //callback(null);
        });
    });
}

CallMediaPipeline.prototype.createWebRtcEndpoint = function (pipeline, webRtcEndpointQueue, fncreateWebRtcEndpoint, media, callback) {
    var kmedia = media;
    //pipeline
    pipeline.create('WebRtcEndpoint', function (error, callerWebRtcEndpoint) {
        if (error) {
            media.pipeline.release();
            media.pipeline = null;
            return callback(error);
        }
        part = webRtcEndpointQueue.shift()
            
        if (part.candidatesQueue) {
            while (part.candidatesQueue.length) {
                var candidate = part.candidatesQueue.shift();
                callerWebRtcEndpoint.addIceCandidate(candidate);
            }
        }


        part.webRtcEndpoint = callerWebRtcEndpoint

        callerWebRtcEndpoint.on('OnIceCandidate', function (event) {
            var partFound = null;
            for (part of room.participiantArray) {
                if (part.type != 1 && part.type != 0)
                    continue;
                if (part.webRtcEndpoint == this) {
                    partFound = part;
                    break;
                }
                    
            }
            var candidate = kurento.getComplexType('IceCandidate')(event.candidate);
            room.GetSocket(partFound.iosocket).emit("av_message", room.MakeAVCandiateMessage(partFound, candidate));
        });

        if (webRtcEndpointQueue.length > 0)
            fncreateWebRtcEndpoint(pipeline, webRtcEndpointQueue, fncreateWebRtcEndpoint, kmedia, callback);
        else {

            for (part of room.participiantArray) {
                if (part.type != 1 && part.type != 0)
                    continue;
                if (part.sdp != null)
                    webRtcEndpointQueue.push(part);
            }
            WebRtcEndpoint1 = webRtcEndpointQueue.shift().webRtcEndpoint;
            WebRtcEndpoint2 = webRtcEndpointQueue.shift().webRtcEndpoint;
            WebRtcEndpoint1.connect(WebRtcEndpoint2, function (error) {
                if (error) {
                    pipeline.release();
                    return callback(error);
                }

                WebRtcEndpoint2.connect(WebRtcEndpoint1, function (error) {
                    if (error) {
                        pipeline.release();
                        return callback(error);
                    }
                    var elements =
                        [
                            { type: 'RecorderEndpoint', params: { uri: 'file:///tmp/recorder_demo1.webm' } },
                            { type: 'RecorderEndpoint', params: { uri: 'file:///tmp/recorder_demo2.webm' } },
                            { type: 'Composite'},
                        ]
                    pipeline.create(elements, function (error, elements) {
                        if (error) {
                            return onError(error);
                            callback(null);
                        }
                        var recorder1 = elements[0];
                        var recorder2 = elements[1];
                        var _composite = elements[2];
                        _composite.createHubPort(function (error, _hubPort1) {
                            console.info("Creating hubPort1");
                            if (error) {
                                return callback(error);
                            }
                            kmedia.hubPorts.push(_hubPort1);
                            _composite.createHubPort(function (error, _hubPort2) {
                                console.info("Creating hubPort 2");
                                if (error) {
                                    return callback(error);
                                }
                                kmedia.hubPorts.push(_hubPort2);
                                _composite.createHubPort(function (error, _hubPort3) {
                                    console.info("Creating hubPort 3");
                                    if (error) {
                                        return callback(error);
                                    }
                                    kmedia.hubPorts.push(_hubPort3);

                                    for (part of room.participiantArray) {
                                        if (part.type != 1 && part.type != 0)
                                            continue;
                                        if (part.sdp != null)
                                            webRtcEndpointQueue.push(part);
                                    }

                                    WebRtcEndpoint1 = webRtcEndpointQueue.shift().webRtcEndpoint;
                                    WebRtcEndpoint2 = webRtcEndpointQueue.shift().webRtcEndpoint;

                                    WebRtcEndpoint1.connect(_hubPort1, function (error) {
                                        if (error) {
                                            return onError(error);
                                            callback(null);
                                        }


                                        WebRtcEndpoint2.connect(_hubPort2, function (error) {
                                            if (error) {
                                                return onError(error);
                                                callback(null);
                                            }


                                            _hubPort3.connect(recorder1, function (error) {
                                                if (error) {
                                                    return onError(error);
                                                    callback(null);
                                                }

                                                recorder1.record(function (error) {
                                                    if (error) {
                                                        return onError(error);
                                                        callback(null);
                                                    }
                                                    console.log("Recording1 started");
                                                    callback(null);
                                                });
                                            });
                                        });
                                    });
                                });
                            });
                            
                        });
                        
                    });
                    
                });
            });
        }
    });
}

CallMediaPipeline.prototype.generateSdpAnswer = function (part, callback) {
    var kmedia = this;
    part.webRtcEndpoint.processOffer(part.sdp, callback);
    part.webRtcEndpoint.gatherCandidates(function (error) {
        if (error) {
            kmedia.pipeline.release();
            kmedia.pipeline = null;
            return callback(error);
        }
    });
}

CallMediaPipeline.prototype.release = function () {
    if (this.pipeline) {
        this.pipeline.release();
    }
      
    this.pipeline = null;
    for (port of this.hubPorts) {
        port.release();
    }
    this.hubPorts.length = 0;
    
}

function ChatRoom(roomId, rooPassword, user, sock_array, room_type) {
    this.roomId = roomId;
    this.roomPassword = rooPassword;
    this.roomName = "";
    this.roomType = room_type
    this.name = user;
    this.owner;
    this.participiantArray = [];
    this.participinatId = 0;
    this.send_receiveTime = Date.now();
    this.service_key = config.dialogflow.service_key_file;
    this.createdAt = new Date();
    this.sock_array = sock_array;
    this.seq_id = 0;
    var pipeline = null; 
    this.webRtcEndpointQueue = [];
}

ChatRoom.prototype.setName = function (name) {
    this.roomName = name;
};

ChatRoom.prototype.SetOwner = function (owner, category) {
    this.owner = owner;
    this.AddParticipiant(this.name, this.owner, category);
    this.AddDialogFlowChannel(config.dialogflow.project_id, { emit: this.detectIntent });
    var serverobj = this.sock_array.find(o => o.type === "server");
    if (serverobj != null) {
        this.AddLoggingChannel('server', serverobj.session);
    }
};

ChatRoom.prototype.GetOwner = function () {
   return  this.owner;
};

ChatRoom.prototype.AddParticipiant = function (Name, sock, category) {
    for (part of this.participiantArray) {
        if (part.iosocket == sock) {
            return
        }
    }
    this.participinatId++;
    this.participiantArray.push({ name: Name, id: this.participinatId, iosocket: sock, handler: 'chat_rx_message', type: category, sdp: null, webRtcEndpoint: null, candidatesQueue: []})
}; 

ChatRoom.prototype.CreatePipeline = function () {
    if (this.pipeline == null)
        this.pipeline = new CallMediaPipeline();
    participiantArray = this.participiantArray
    room = this;
    pipeline = this.pipeline;
    webRtcEndpointQueue = this.webRtcEndpointQueue;
    this.pipeline.createPipeline(this, function (error) {
        if (error) {
            return onError(error, error);
        }

        for (part of participiantArray) {
            if (part.type != 1 && part.type != 0)
                continue;
            if (part.sdp != null)
                webRtcEndpointQueue.push(part);
        }

        if (webRtcEndpointQueue.length > 0) {
            part1 = webRtcEndpointQueue.shift()
            room.generateSdpAnswer(part1, webRtcEndpointQueue, room)
        }
    });

    function onError(callerReason, calleeReason) {

    }
};

ChatRoom.prototype.generateSdpAnswer = function (part, webRtcEndpointQueue, room) {
    this.pipeline.generateSdpAnswer(part, function (error, SdpAnswer) {
        if (error) {
            return onError(error, error);
        }
        var partFound = null;
        for (part of room.participiantArray) {
            if (part.type != 1 && part.type != 0)
                continue;
            if (part.webRtcEndpoint == this) {
                partFound = part;
                break;
            }
        }

        room.GetSocket(part.iosocket).emit("av_message", room.MakeAVAnswerSdpMessage(partFound, SdpAnswer));

        if (webRtcEndpointQueue.length > 0) {
            part1 = webRtcEndpointQueue.shift()
            room.generateSdpAnswer(part1, webRtcEndpointQueue, room)
        }
            
        else
            return;
    });
}

ChatRoom.prototype.ExgIceCandidates = function (from_sock, candidate, sock_array) {
    if (sock_array != null)
        this.sock_array = sock_array

    this.send_receiveTime = Date.now();
    participiant = null;
    for (part of this.participiantArray) {
        if (part.iosocket == from_sock) {
            participiant = part;
            break;
        }
    }

    if (participiant != null) {
        var _candidate = kurento.getComplexType('IceCandidate')(candidate);
        if (participiant.webRtcEndpoint != null)
            participiant.webRtcEndpoint.addIceCandidate(_candidate);
        else
            participiant.candidatesQueue.push(candidate);
    }

}

ChatRoom.prototype.CreateVideoCall = function (from_sock, sdpOffer, sock_array) {
    if (sock_array != null)
        this.sock_array = sock_array

    this.send_receiveTime = Date.now();
    participiant = null;
    for (part of this.participiantArray) {
        if (part.iosocket == from_sock) {
            participiant = part;
            break;
        }
    }

    if (participiant != null) {
        participiant.sdp = sdpOffer;
        for (part of this.participiantArray) {
            if (part.iosocket != from_sock) {
                if (part.type == 1 || part.type == 0)
                    this.GetSocket(part.iosocket).emit("av_message", this.MakeAVControlMessage(participiant, "AVOffer"));
            }
        }
    }
}; 


ChatRoom.prototype.HangupVideoCall = function (from_sock, sock_array) {
    if (sock_array != null)
        this.sock_array = sock_array

    this.send_receiveTime = Date.now();
    participiant = null;
    for (part of this.participiantArray) {
        if (part.iosocket == from_sock) {
            participiant = part;
            break;
        }
    }
    if (participiant != null) {
        if (this.pipeline != null) {
            console.info('Releasing pipeline');
            this.pipeline.release();
            this.pipeline = null;
            this.webRtcEndpointQueue.length = 0;
        }
        for (part of this.participiantArray) {
            console.info('Releasing room fields');
            if (part.sdp != null)
                part.sdp = null
            if (part.candidatesQueue != null)
                part.candidatesQueue.length = 0;
            if (part.webRtcEndpoint != null)
                webRtcEndpoint = null;
            try {
                if (part.type == 1 || part.type == 0)
                    this.GetSocket(part.iosocket).emit("av_message", this.MakeHangupMessage(participiant));
            }
            catch (ex) {
                Console.log(ex);
            }
            
        }
    }
}

ChatRoom.prototype.AcceptVideoCall = function (from_sock, sdpOffer, sock_array) {
    if (sock_array != null)
        this.sock_array = sock_array

    call_accepted = false;

    this.send_receiveTime = Date.now();
    participiant = null;
    for (part of this.participiantArray) {
        if (part.iosocket == from_sock) {
            participiant = part;
            break;
        }
    }

    if (participiant != null) {
        participiant.sdp = sdpOffer;
        for (part of this.participiantArray) {
            if (part.iosocket != from_sock) {
                if (part.type == 1 || part.type == 0) {
                    this.GetSocket(part.iosocket).emit("av_message", this.MakeAVControlMessage(participiant, "AVAccept"));
                    call_accepted = true;
                }
            }
        }
    }

    if (call_accepted == true)
        this.CreatePipeline();
}; 

ChatRoom.prototype.RejectVideoCall = function (from_sock, sdpOffer, sock_array) {
    if (sock_array != null)
        this.sock_array = sock_array

    this.send_receiveTime = Date.now();
    participiant = null;
    for (part of this.participiantArray) {
        if (part.iosocket == from_sock) {
            participiant = part;
            break;
        }
    }

    if (participiant != null) {
        participiant.sdp = sdpOffer;
        for (part of this.participiantArray) {
            if (part.iosocket != from_sock) {
                if (part.type == 1 || part.type == 0)
                    this.GetSocket(part.iosocket).emit("av_message", this.MakeAVControlMessage(participiant, "AVReject"));
            }
        }
    }
}; 

ChatRoom.prototype.AddDialogFlowChannel = function (Name, sock) {
    this.participinatId++;
    this.participiantArray.push({ name: 'Unibo', id: this.participinatId, iosocket: sock, handler: Name, type: 100})
};

ChatRoom.prototype.AddLoggingChannel = function (Name, sock) {
    this.participinatId++;
    this.participiantArray.push({ name: 'Server', id: this.participinatId, iosocket: sock, handler: 'chat_rx_message', type: 200 })
};

ChatRoom.prototype.RemoveParticipiant = function (name, sock) {
    index = -1;
    found = false;
    for (part of this.participiantArray) {
        index++;
        if (part.iosocket == sock) {
            found = true;
            break;
        }
    }
    if (found == true && index >= 0) {
        this.participiantArray.splice(index,1);
    }
}; 

ChatRoom.prototype.ParticipiantCount = function () {
    return this.participiantArray.length;
};

ChatRoom.prototype.BroadcastMessage = function (from_sock, message, sock_array) {
    if (sock_array != null)
        this.sock_array = sock_array
    this.send_receiveTime = Date.now();
    participiant = null;
    for (part of this.participiantArray) {
        if (part.iosocket == from_sock) {
            participiant = part;
            break;
        }
    }
    var liveIncON = this.participiantArray.find(o => o.type === 0);

    if (participiant != null) {
        for (part of this.participiantArray) {
            if (part.iosocket != from_sock) {
                if (part.type == 0 || part.type == 1 || part.type == 200)
                    this.GetSocket(part.iosocket).emit(part.handler, this.MakeMessage(participiant, message.content));
                else {
                    if (message.content.startsWith("@Unibo") || liveIncON == null) {
                        var content = message.content.substring(7);
                        if (liveIncON == null)
                            content = message.content;
                        
                        this.detectIntent(part.handler, content, this.participiantArray, this.roomId);
                    }
                }
            }
        }
    }
};

ChatRoom.prototype.RemoteVideoControl = function (from_sock, message, sock_array) {
    if (sock_array != null)
        this.sock_array = sock_array
    this.send_receiveTime = Date.now();
    participiant = null;
    for (part of this.participiantArray) {
        if (part.iosocket == from_sock) {
            participiant = part;
            break;
        }
    }

    if (participiant != null) {
        for (part of this.participiantArray) {
            if (part.iosocket != from_sock) {
                if (part.type == 1)
                    this.GetSocket(part.iosocket).emit("chat_message", message);
            }
        }
    }
};

ChatRoom.prototype.UploadFileLink = function (from_sock, message, sock_array) {
    if (sock_array != null)
        this.sock_array = sock_array
    this.send_receiveTime = Date.now();
    participiant = null;
    for (part of this.participiantArray) {
        if (part.iosocket == from_sock) {
            participiant = part;
            break;
        }
    }
    if (participiant != null) {
        for (part of this.participiantArray) {
            if (part.type == 0 || part.type == 1)
                    this.GetSocket(part.iosocket).emit(part.handler, this.MakeFileUploadLink(participiant,message));
        }
    }
};

ChatRoom.prototype.MakeFileUploadLink = function (part, message) {
    var upload_link = '<span>' + message.username +' has sent you a file. <a href=\'http://localhost:51670/downloads/' + message.fileName +'\' id=\'downlaodLink\' target=\'_blank\'>\
                        <i class=\'fa fa-download\' aria-hidden=\'true\'></i></a></span>'
    var packet = '{"message": "media", "agent" : "System", "text" : "' + upload_link + '", "session" : "' + part.iosocket + '", "room" : "' + this.roomId + '" }';
    return packet;
}

ChatRoom.prototype.MakeFileUploadLink2 = function (part, message) {
    var upload_link = '<span>Please select a option from below button: <span><br /><button class=\'btn btn-warning\' id=\'btn-chat_yes\'>Account</button>\
                       <button class=\'btn btn-warning\' id=\'btn-chat_no\'>CreditCard</button>';
    var packet = '{"message": "media", "agent" : "System", "text" : "' + upload_link + '", "session" : "' + part.iosocket + '", "room" : "' + this.roomId + '" }';
    return packet;
}

ChatRoom.prototype.MakeMessage = function (part, message) {
    var packet = '{"message": "media", "agent" : "' + part.name + '", "text" : "' + message + '", "session" : "' + part.iosocket + '", "room" : "' + this.roomId +'" }';
    return packet;
}

ChatRoom.prototype.MakeAVControlMessage = function (part, message, sdp) {
    var packet = {"message":  message , "agent" :  part.name , "session" :  part.iosocket, "room" :  this.roomId};
    return JSON.stringify(packet);
}

ChatRoom.prototype.MakeAVCandiateMessage = function (part, candidate) {
    var packet = { "message": "AViceCandidate", "agent": part.name, "session": part.iosocket, "room": this.roomId, "candidate": candidate };
    console.log("ToClient: " + JSON.stringify(packet));
    return JSON.stringify(packet);
}

ChatRoom.prototype.MakeAVAnswerSdpMessage = function (part, sdpAnswer) {
    var packet = { "message": "AVAnswerSdp", "agent": part.name, "session": part.iosocket, "room": this.roomId, "sdpAnswer": sdpAnswer};
    return JSON.stringify(packet);
}

ChatRoom.prototype.MakeHangupMessage = function (part) {
    var packet = { "message": "AVHangup", "agent": part.name, "session": part.iosocket, "room": this.roomId};
    return JSON.stringify(packet);
}

ChatRoom.prototype.CreateOptions = function (options) {

    var upload_link = '';

    options.listValue.values.forEach(element3 => {
        if (element3.kind == 'structValue') {
            if (element3.structValue.fields.title.kind == 'stringValue') {
                console.log(element3.structValue.fields.title.stringValue);
                upload_link += '<button class=\'btn btn-warning option-button\' id=\'btn-chat_yes\' value=\'#VALUE#\' style=\'margin-right: 5px;margin-top: 4px;\' onclick=\'btnSendMessage(this)\'>' + element3.structValue.fields.title.stringValue + '</button>';
            }
            if (element3.structValue.fields.value.kind == 'stringValue') {
                console.log(element3.structValue.fields.value.stringValue);
                upload_link = upload_link.replace('#VALUE#', element3.structValue.fields.value.stringValue)
            }
        }
    });
    console.log(upload_link);
    return upload_link;
}

ChatRoom.prototype.CreateImage = function (image) {
    var upload_link = '';
    upload_link = '<img src = \'#IMAGE#\' class=\'img-rounded\'>';
    upload_link = upload_link.replace('#IMAGE#', image)
    console.log(upload_link);
    return upload_link;
}

ChatRoom.prototype.EmbedObject = function (object) {
    var upload_link = '';
    upload_link = '<embed type=\'#MIMETYPE#\' src =\'#OBJECT#\' width=\'100%\' height=\'100%\'>';
    upload_link = upload_link.replace('#OBJECT#', object.name)
    upload_link = upload_link.replace('#MIMETYPE#', object.type)
    console.log(upload_link);
    return upload_link;
}

ChatRoom.prototype.CreateCarousel = function (attachments) {
    var upload_link = '<div id=\'#CAROUSELNAME#\' class=\'carousel slide\' data-ride=\'carousel\'>';
    upload_link += '<ol class=\'carousel-indicators\'>';
    var i = 0;
    if (attachments.kind == 'listValue') {
        for (value of attachments.listValue.values) {
            if( i == 0)
                upload_link += '<li data-target=\'##CAROUSELNAME#\' data-slide-to=\'' + i + '\' class=\'active\'></li>';
            else
                upload_link += '<li data-target=\'##CAROUSELNAME#\' data-slide-to=\'' + i + '\'></li>';
            i++;
            if (value.kind == 'structValue') {
                value.structValue.fields.buttons
                value.structValue.fields.images
                value.structValue.fields.title
                value.structValue.fields.subtitle
            }
        }
        upload_link += '</ol>';
        upload_link += '<div class=\'carousel-inner\'>';
        i = 0;
        for (value of attachments.listValue.values) {
            if (i == 0)
                upload_link += '<div class=\'item active\'>';
            else
                upload_link += '<div class=\'item\'>';
            i++;
            if (value.kind == 'structValue') {

                upload_link += '<div>';
                upload_link += '<img src=\'' + value.structValue.fields.images.listValue.values[0].structValue.fields.url.stringValue + '\' alt=\'Los Angeles\'  class=\'img-thumbnail\'>';
                upload_link += '</div>';
                upload_link += '<div>';
                upload_link += '<button class=\'btn btn-warning option-button\' id=\'btn-chat_yes\' value=\'#VALUE#\' style=\'margin-right: 5px;margin-top: 4px;\' onclick=\'btnSendMessage(this)\'>' + value.structValue.fields.buttons.listValue.values[0].structValue.fields.title.stringValue + '</button>';
                upload_link = upload_link.replace('#VALUE#', value.structValue.fields.buttons.listValue.values[0].structValue.fields.value.stringValue)
                upload_link += '</div>';
                upload_link += '</div>';
                value.structValue.fields.buttons
                value.structValue.fields.images
                value.structValue.fields.title
                value.structValue.fields.subtitle
            }
        }
        upload_link += '</div>';
        upload_link += '<a class=\'left carousel-control\' href=\'##CAROUSELNAME#\' data-slide=\'prev\'>';
        upload_link += '<span class=\'glyphicon glyphicon-chevron-left\'></span>';
        upload_link += '<span class=\'sr-only\'>Previous</span>';
        upload_link += '</a>';

        upload_link += '<a class=\'right carousel-control\' href=\'##CAROUSELNAME#\' data-slide=\'next\'>';
        upload_link += '<span class=\'glyphicon glyphicon-chevron-right\'></span>';
        upload_link += '<span class=\'sr-only\'>Next</span>';
        upload_link += '</a>';
        upload_link += '</div>';
    }

    upload_link = upload_link.replace(/#CAROUSELNAME#/g, 'uniCarousel' + this.seq_id);
    this.seq_id++;
    if (this.sq_id > 1000)
        this.sq_id = 0;
    //attachments.kind.listValue.values.length

    console.log(upload_link);
    return upload_link;
}

ChatRoom.prototype.CreateCarousel2 = function () {
    var upload_link = '';
    upload_link = '<div id=\'myCarousel\' class=\'carousel slide\' data-ride=\'carousel\'> \
  <ol class=\'carousel-indicators\'> \
    <li data-target=\'#myCarousel\' data-slide-to=\'0\' class=\'active\'></li> \
    <li data-target=\'#myCarousel\' data-slide-to=\'1\'></li> \
    <li data-target=\'#myCarousel\' data-slide-to=\'2\'></li> \
  </ol> \
  <div class=\'carousel-inner\'> \
    <div class=\'item active\'> \
      <img src=\'http://122.160.24.159:2606/chat/Images2?image=in-nri-homepage-pintile-400x400\' alt=\'Los Angeles\' style=\'height: 200px;width: 200px;\' class=\'img-thumbnail\'> \
    </div> \
    <div class=\'item\'> \
      <img src=\'http://122.160.24.159:2606/chat/Images2?image=in-sc-edge-app\' alt=\'Chicago\' style=\'height: 200px;width: 200px;\' class=\'img-thumbnail\'> \
    </div>  \
    <div class=\'item\'> \
      <img src=\'http://122.160.24.159:2606/chat/Images2?image=in-campaign-with-lifestyles\' alt=\'New York\' style=\'height: 200px;width: 200px;\' class=\'img-thumbnail\'> \
    </div> \
  </div> \
  <a class=\'left carousel-control\' href=\'#myCarousel\' data-slide=\'prev\'> \
    <span class=\'glyphicon glyphicon-chevron-left\'></span> \
    <span class=\'sr-only\'>Previous</span> \
  </a> \
  <a class=\'right carousel-control\' href=\'#myCarousel\' data-slide=\'next\'> \
    <span class=\'glyphicon glyphicon-chevron-right\'></span> \
    <span class=\'sr-only\'>Next</span> \
  </a> \
</div>'

    console.log(upload_link);
    return upload_link;
}

ChatRoom.prototype.CreateCarousel3 = function (obj) {
    var upload_link = '';
    upload_link = '<div id=\'uniCarousel\' class=\'carousel slide\' data-ride=\'carousel\'>\
<ol class=\'carousel-indicators\'>\
	<li data-target=\'#myCarousel\' data-slide-to=\'0\' class=\'active\'></li>\
	<li data-target=\'#myCarousel\' data-slide-to=\'1\'></li>\
	<li data-target=\'#myCarousel\' data-slide-to=\'2\'></li>\
	<li data-target=\'#myCarousel\' data-slide-to=\'3\'></li>\
</ol>\
<div class=\'carousel-inner\'>\
	<div class=\'item active\'>\
		<img src=\'http://122.160.24.159:2606/chat/Images2?image=in-nri-homepage-pintile-400x400\' alt=\'Los Angeles\' style=\'height: 200px;width: 200px;\' class=\'img-thumbnail\'>\
	</div>\
	<div class=\'item active\'>\
		<img src=\'http://122.160.24.159:2606/chat/Images2?image=in-prc-pin-tile-400x400\' alt=\'Los Angeles\' style=\'height: 200px;width: 200px;\' class=\'img-thumbnail\'>\
	</div><div class=\'item active\'>\
		<img src=\'http://122.160.24.159:2606/chat/Images2?image=in-campaign-with-lifestyles\' alt=\'Los Angeles\' style=\'height: 200px;width: 200px;\' class=\'img-thumbnail\'>\
	</div>\
	<div class=\'item active\'>\
		<img src=\'http://122.160.24.159:2606/chat/Images2?image=in-sc-edge-app\' alt=\'Los Angeles\' style=\'height: 200px;width: 200px;\' class=\'img-thumbnail\'>\
	</div>\
</div>\
<a class=\'left carousel-control\' href=\'#myCarousel\' data-slide=\'prev\'> \
	<span class=\'glyphicon glyphicon-chevron-left\'></span>\
	<span class=\'sr-only\'>Previous</span></a><a class=\'right carousel-control\' href=\'#myCarousel\' data-slide=\'next\'>\
	<span class=\'glyphicon glyphicon-chevron-right\'></span><span class=\'sr-only\'>Next</span>\
</a>\
</div>'

    console.log(upload_link);
    return upload_link;
}

ChatRoom.prototype.GetSocket = function (session) {
    var clientobj = this.sock_array.find(o => o.session === session);
    return clientobj.socket;
}
ChatRoom.prototype.jsonEscape = function (str) {
    return str.replace(/\n/g, "\\\\n").replace(/\r/g, "\\\\r").replace(/\t/g, "\\\\t");
}

ChatRoom.prototype.detectIntent = async function  (projectId, message, obj, session) {

    try {
        process.env.GOOGLE_APPLICATION_CREDENTIALS = this.service_key;
        // A unique identifier for the given session
        const sessionId = session;//uuid.v4();

        let privateKey = (process.env.NODE_ENV == "production") ? JSON.parse(process.env.DIALOGFLOW_PRIVATE_KEY) : process.env.DIALOGFLOW_PRIVATE_KEY
        let clientEmail = process.env.DIALOGFLOW_CLIENT_EMAIL
        let config = {
            credentials: {
                private_key: privateKey,
                client_email: clientEmail
            }
        }

        // Create a new session
        const sessionClient = new dialogflow.SessionsClient();
        const sessionPath = sessionClient.sessionPath(projectId, sessionId);

        // The text query request.
        const request = {
            session: sessionPath,
            queryInput: {
                text: {
                    // The query to send to the dialogflow agent
                    text: message,
                    // The language used by the client (en-US)
                    languageCode: 'en-US',
                },
            },
        };

        // Send request and log result
        const responses = await sessionClient.detectIntent(request);
        console.log('Detected intent');
        const result = responses[0].queryResult;
        console.log(`  Query: ${result.queryText}`);
        console.log(`  Response: ${result.fulfillmentText}`);
        result.fulfillmentMessages.forEach(element => {
            console.log(element.message);
            if (element.message == 'simpleResponses') {
                element.simpleResponses.simpleResponses.forEach(element2 => {
                    console.log(element2);
                    //for (part of obj) {
                    //    if (part.type == 0 || part.type == 1 || part.type == 200) {
                    //        msg = element2.textToSpeech.replace("\\n", "");
                    //        msg = msg.replace("\\r", "");
                    //        msg = msg.replace("\r", "");
                    //        msg = msg.replace("\n", "");
                    //        msg = msg.replace("\r", "\\r");
                    //        msg = msg.replace("\n", "\\n");
                    //        var packet = '{"agent" : "' + "Unibo" + '", "text" : "' + msg + '","session" : "' + part.iosocket + '", "room" : "'+ this.roomId +'"}';
                    //        this.GetSocket(part.iosocket).emit(part.handler, packet);
                    //    }
                    //}
                });
            }
            else if (element.message == 'text') {
                element.text.text.forEach(element2 => {
                    console.log(element2);
                    for (part of obj) {
                        if (part.type == 0 || part.type == 1 || part.type == 200) {
                            msg = element2.replace("\\n", "");
                            msg = msg.replace("\\r", "");
                            msg = msg.replace("\r", "");
                            msg = msg.replace("\n", "");
                            msg = msg.replace("\r", "\\r");
                            msg = msg.replace("\n", "\\n");
                            var packet = '{"agent" : "' + "Unibo" + '", "text" : "' + msg + '","session" : "' + part.iosocket + '", "room" : "' + this.roomId + '"}';
                            this.GetSocket(part.iosocket).emit(part.handler, packet);
                        }
                    }
                });
            }
            else if (element.message == 'payload') {
                if (element.platform != 'ACTIONS_ON_GOOGLE' && element.payload.fields.options != null && element.payload.fields.options.kind == 'listValue') {

                    msg = this.CreateOptions(element.payload.fields.options);
                    //msg = this.CreateImage('/images/bike.jpg');
                    //msg = this.CreateCarousel()
                   // msg = this.EmbedObject({ type: "application/pdf", name: "/images/test.pdf"});
                    for (part of obj) {
                        if (part.type == 1) {
                            var packet = '{"agent" : "' + "Unibo" + '", "text" : "' + msg + '","session" : "' + part.iosocket + '", "room" : "' + this.roomId + '"}';
                            this.GetSocket(part.iosocket).emit(part.handler, packet);
                        }
                    }
                }
                if (element.payload.fields.attachments != null && element.payload.fields.attachmentLayout != null && element.payload.fields.attachmentLayout.stringValue == 'carousel') {
                    msg = this.CreateCarousel(element.payload.fields.attachments);
                    for ( part of obj) {
                        if (part.type == 1) {
                            var packet = '{"agent" : "' + "Unibo" + '", "text" : "' + msg + '","session" : "' + part.iosocket + '", "room" : "' + this.roomId + '"}';
                            this.GetSocket(part.iosocket).emit(part.handler, packet);
                        }
                    }
                }
                var xx = 0;
            }
            
        }); 
        //result.fulfillmentMessages[2].payload.IVRResponse
        if (result.intent) {
            console.log(`  Intent: ${result.intent.displayName}`);
        } else {

            console.log(`  No intent matched.`);
        }

        //for (part of obj) {
        //    if (part.type == 0 || part.type == 1 || part.type == 200) {
        //        msg = result.fulfillmentText.replace("\\n", "");
        //        msg = msg.replace("\\r", "");
        //        msg = msg.replace("\r", "");
        //        msg = msg.replace("\n", "");
        //        msg = msg.replace("\r", "\\r");
        //        msg = msg.replace("\n", "\\n");
        //        var packet = '{"agent" : "' + "Unibo" + '", "text" : "' + msg + '","session" : "' + part.iosocket + '", "room" : "'+ this.roomId +'"}';
        //        this.GetSocket(part.iosocket).emit(part.handler, packet);
        //    }
        //}
    }
    catch (ex) {
        let ts = Date.now();
        console.log(getdate() + '\t' + 'ERROR: ' + ex);
    }

}


function ChatList() {
    this.roomList = [];
}

ChatList.prototype.addRoom = function (room) {
    this.roomList.push(room);
};

ChatList.prototype.getRoom = function (roomId) {
    for (room of this.roomList) {
        if (room.roomId == roomId)
            return room;
    }
    return null;
};

ChatList.prototype.removeRoom = function (roomId) {
     for (var i = 0; i < this.roomList.length; i++) {
        if (this.roomList[i].roomId == roomId) {
            this.roomList[i].participiantArray.length = 0;
            this.roomList.splice(i,1);
            return;
        }
    }
};

ChatList.prototype.getroomlist = function () {
    room_array = [];
    for (room of this.roomList) {
        room_array.push({ "Id": room.roomId, "Name": room.roomName, "RoomType": room.roomType, "Participiants": room.participiantArray.length, "Owner": room.name, "CreatedAt": this.getdate(room.createdAt), "LastActivityAt": this.getdate(new Date(room.send_receiveTime)) })
    }
    return room_array;
};

ChatList.prototype.getpartlist = function (roomId) {
    part_array = [];
    for (room of this.roomList) {
        if (room.roomId == roomId) {
            for (part of room.participiantArray) {
                part_array.push({ "Id": part.id, "Name": part.name })
            }
            break;
        }
    }
    return part_array;
};

ChatList.prototype.getdate = function (date_ob) {
    //let date_ob = new Date();
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
};

ChatList.prototype.checkActiveSessions = function () {
    for (var i = 0; i < this.roomList.length; i++) {
        var timegap = Date.now() - this.roomList[i].send_receiveTime;
        if (timegap > config.timer.chat_inactive_interval) {
            for (part of this.roomList[i].participiantArray) {
                if (part.type == 0 || part.type == 0 || part.type == 200) {
                    var packet = '{"message": "media", agent" : "system", "text" : "Chat ended due to non activity", "session" : "' + part.iosocket + '", "room" : "' + this.roomList[i].roomId +'"}';
                    this.roomList[i].GetSocket(part.iosocket).emit('chat_rx_message', packet);
                }
            }
            console.log(this.getdate(new Date) + '\t' + 'checkActiveSessions Inactive room removed: ' + this.roomList[i].roomId + ', Interval:' + timegap);
            this.removeRoom(this.roomList[i].roomId);
            return;
        }
    } 
    var xx = 0;
};


module.exports = 
{
    ChatList: ChatList,
    ChatRoom: ChatRoom
};
//module.exports = ChatRoom;