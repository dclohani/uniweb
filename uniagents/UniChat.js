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
    this.composite = null;
    this.recorder = null;
    this.reocrderHubPort = null;
    this.record_flag = false;
    this.utils = new Utils();
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
    this.participiantArray.push({ name: Name, id: this.participinatId, iosocket: sock, handler: 'chat_rx_message', type: category, sdp: null, webRtcEndpoint: null, candidatesQueue: [], hubPort: null})
}; 

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

    if (participiant == null) {
        console.info('Participiant is not found');
        return;
    }

    participiant.sdp = sdpOffer;

    room = this;
    if (this.pipeline == null) {

        getKurentoClient(function (error, kurentoClient) {
            if (error) {
                return callback(error);
            }

            kurentoClient.create('MediaPipeline', function (error, pipeline) {
                if (error) {
                    return callback(error);
                }
                room.pipeline = pipeline;
                var elements =
                    [
                        { type: 'Composite' },
                    ]
                pipeline.create(elements, function (error, elements) {
                    if (error) {
                        return callback(error);
                    }

                    var _composite = elements[0];
                    room.composite = _composite;
                    _composite.createHubPort(function (error, _hubPort) {
                        if (error) {
                            return callback(error);
                        }

                        room.reocrderHubPort = _hubPort;
                        room.CreateWebRtcEndpoints(pipeline, participiant);
                    });
                });
            });
        });
    }
    else {
        this.CreateWebRtcEndpoints(this.pipeline, participiant);
        if (this.record_flag == false) {
            var record_file_name = this.roomId + '_' + this.utils.currentdatetime() + '.webm';
            this.StartRecordVideoCall(record_file_name);
        }
    }
}; 


ChatRoom.prototype.CreateWebRtcEndpoints = function (pipeline, participiant) {
    room = this;
    pipeline.create('WebRtcEndpoint', function (error, WebRtcEndpoint) {
        if (error) {
            room.pipeline.release();
            room.pipeline = null;
            return callback(error);
        }

        participiant.webRtcEndpoint = WebRtcEndpoint;
        while (participiant.candidatesQueue.length) {
            var candidate = participiant.candidatesQueue.shift();
            WebRtcEndpoint.addIceCandidate(candidate);
        }
        WebRtcEndpoint.on('OnIceCandidate', function (event) {
            var candidate = kurento.getComplexType('IceCandidate')(event.candidate);
            room.GetSocket(participiant.iosocket).emit("av_message", room.MakeAVCandiateMessage(participiant, candidate));
        });

        if (room.composite == null) {
            room.pipeline.release();
            room.pipeline = null;
            return callback(error);
        }

        room.composite.createHubPort(function (error, _hubPort) {
            if (error) {
                return callback(error);
            }
            participiant.hubPort = _hubPort;

            WebRtcEndpoint.connect(_hubPort, function (error) {
                if (error) {
                    return callback(error);
                }
                _hubPort.connect(WebRtcEndpoint, function (error) {
                    if (error) {
                        return callback(error);
                    }

                    WebRtcEndpoint.processOffer(participiant.sdp, function (error, SdpAnswer) {
                        if (error) {
                            return callback(error);
                        }
                        room.GetSocket(participiant.iosocket).emit("av_message", room.MakeAVAnswerSdpMessage(participiant, SdpAnswer));
                    });
                    WebRtcEndpoint.gatherCandidates(function (error) {
                        if (error) {
                            room.pipeline.release();
                            room.pipeline = null;
                            return callback(error);
                        }
                    });
                })
            })
        });
    });
    //callback(null);
}

ChatRoom.prototype.StartVideoRecord = function (from_sock, filename, sock_array) {

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

    if (participiant == null) {
        return;
    }
    else if (this.record_flag == true) {
        
    }

    var record_file_name = filename;
    if (filename.length <= 0) {
        record_file_name = this.roomId + '_' + this.utils.currentdatetime() + '.webm';
    }
    this.StartRecordVideoCall(record_file_name);

}

ChatRoom.prototype.StopVideoRecord = function (from_sock, sock_array) {

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

   
    if (participiant == null) {
        return;
    }
    else if (this.record_flag == false) {
        return;
    }

    this.StopRecordVideoCall();

}

ChatRoom.prototype.StartRecordVideoCall = function (filename) {
    room = this;
    if (this.pipeline == null) {
        room.DispatchRecordingStatus(filename,-1, "pipeline error")
        return;
    }

    var file_url = 'file:/' + config.video_recording_folder + '/' + filename;
    var elements =
        [
            { type: 'RecorderEndpoint', params: { uri: file_url } },
        ]
    this.pipeline.create(elements, function (error, elements) {
        if (error) {
            room.DispatchRecordingStatus(filename, -1, error);
            return;
        }

        var _recorder = elements[0];
        room.recorder = _recorder;
        room.reocrderHubPort.connect(_recorder, function (error) {
            if (error) {
                room.DispatchRecordingStatus(filename, -1, error);
                return;
            }

            _recorder.record(function (error) {
                if (error) {
                    room.DispatchRecordingStatus(filename, -1, error);
                    return;
                }
                room.record_flag = true;
                room.DispatchRecordingStatus(filename, 1, '');
                console.log("Recording started");
            });

        });
    });
}

ChatRoom.prototype.DispatchRecordingStatus = function (filename, message, discription) {
    for (part of this.participiantArray) {
        try {
            if (part.type == 1 || part.type == 0) {
                this.GetSocket(part.iosocket).emit("av_message", this.MakeRecordingMessage(part, message, filename, discription));
            }
        }
        catch (ex) {
            console.log(ex);
        }
    }
}

ChatRoom.prototype.StopRecordVideoCall = function () {
    room = this;
    if (room.record_flag != true) {
        return;
    }
    else if (room.recorder == null) {
        return;
    }
    room.recorder.stop();
    room.recorder = null;
    room.record_flag = false;
    room.DispatchRecordingStatus('', 0, '');
    console.log("Recording stopped");
}

ChatRoom.prototype.HangupVideoCall = function (from_sock, peerhangup, sock_array) {
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
        if (peerhangup == 0) {
            this.GetSocket(part.iosocket).emit("av_message", this.MakeHangupMessage(participiant));
            this.ResetParticipiant(participiant, 1);
            return;
        }
        for (part of this.participiantArray) {
            try {
                if (part.type == 1 || part.type == 0) {
                    this.GetSocket(part.iosocket).emit("av_message", this.MakeHangupMessage(part));
                    this.ResetParticipiant(part, 1);
                }
            }
            catch (ex) {
                console.log(ex);
            }
        }
    }
}

ChatRoom.prototype.ResetAllParticipiant = function (participiant) {
    for (part of this.participiantArray) {
        try {
            if (part.type == 1 || part.type == 0) {
                try {

                    this.GetSocket(part.iosocket).emit("av_message", this.MakeHangupMessage(participiant));
                }
                catch (ex) {

                }
                this.part(part);
            }
        }
        catch (ex) {
            console.log(ex);
        }
    }
}

ChatRoom.prototype.ResetParticipiant = function (participiant, peerhangup) {

    if (participiant == null)
        return;

    if (participiant.hubPort != null) {
        participiant.hubPort.release();
        participiant.hubPort = null;
    }
    if (participiant.sdp != null)
        participiant.sdp = null

    if (participiant.candidatesQueue != null)
        participiant.candidatesQueue.length = 0;

    if (participiant.webRtcEndpoint != null)
        participiant.webRtcEndpoint = null;

    var count = 0;
    for (part of this.participiantArray) {
        if (part == participiant) {
            continue;
        }
        if (part.type != 1 && part.type != 0)
            continue;
        if (part.webRtcEndpoint != null)
            count++;
    }

    if (count == 0) {
        this.StopRecordVideoCall();
        if (this.reocrderHubPort != null) {
            this.reocrderHubPort.release();
            this.reocrderHubPort = null;
        }
            
        if (this.pipeline != null) {
            this.pipeline.release();
            this.pipeline = null;
        }

        this.webRtcEndpointQueue.length = 0;
        this.recorder = null;            
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
        participiant = this.participiantArray[index];
        this.ResetParticipiant(participiant, 0);
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
                    this.GetSocket(part.iosocket).emit(part.handler, this.MakeMessage(participiant, message.content, part));
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
                    this.GetSocket(part.iosocket).emit(part.handler, this.MakeFileUploadLink(participiant,message, part));
        }
    }
};

ChatRoom.prototype.MakeFileUploadLink = function (part, message, to)  {
    var upload_link = '<span>' + message.username +' has sent you a file. <a href=\'http://localhost:51670/downloads/' + message.fileName +'\' id=\'downlaodLink\' target=\'_blank\'>\
                        <i class=\'fa fa-download\' aria-hidden=\'true\'></i></a></span>'
    var packet = '{"message": "media", "agent" : "System", "text" : "' + upload_link + '", "session" : "' + to.iosocket + '", "room" : "' + this.roomId + '" }';
    return packet;
}

ChatRoom.prototype.MakeFileUploadLink2 = function (part, message) {
    var upload_link = '<span>Please select a option from below button: <span><br /><button class=\'btn btn-warning\' id=\'btn-chat_yes\'>Account</button>\
                       <button class=\'btn btn-warning\' id=\'btn-chat_no\'>CreditCard</button>';
    var packet = '{"message": "media", "agent" : "System", "text" : "' + upload_link + '", "session" : "' + part.iosocket + '", "room" : "' + this.roomId + '" }';
    return packet;
}

ChatRoom.prototype.MakeMessage = function (part, message, to) {
    var packet = '{"message": "media", "agent" : "' + part.name + '", "text" : "' + message + '", "session" : "' + to.iosocket + '", "room" : "' + this.roomId +'" }';
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


ChatRoom.prototype.MakeRecordingMessage = function (part, status, filename, error) {
    var packet = { "message": "AVRecording", "agent": part.name, "session": part.iosocket, "room": this.roomId, "status":  status, "filename": filename, "error": error};
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

ChatRoom.prototype.CreateDateTimePicker = function (options) {

    var upload_link = '';
    //upload_link = '<input data-provide=\'datepicker\'>';
    upload_link = '<div class=\'input-group date\' data-provide=\'datepicker\'>'
    upload_link += '<input type=\'text\' class=\'form-control\' id=\'pickerid\'>'
    upload_link += '<div class=\'input-group-addon\'>'
    upload_link += '<span class=\'glyphicon glyphicon-th\'></span>'
    upload_link += '</div>'
    upload_link += '</div>'
    upload_link += '<script>$(\'.datepicker\').datepicker(\'update\', \'2011-03-05\');$(\'#pickerid\').on(\'focusout\', function(e) {btnSendMessage(this);});</script>'

    //upload_link = upload_link.replace('#IMAGE#', image)
    console.log(upload_link);
    return upload_link;
}

ChatRoom.prototype.CreateImage = function (image) {
    var upload_link = '';
    upload_link = '<img src = \'#IMAGE#\' class=\'img-responsive\'>';
    upload_link = upload_link.replace('#IMAGE#', image.structValue.fields.src.stringValue)
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
                    languageCode: 'en-IN',
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
                   //msg = this.CreateDateTimePicker(element.payload.fields.options)
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
                if (element.payload.fields.datetimepicker != null && element.payload.fields.datetimepicker.kind == "stringValue") {
                    msg = this.CreateDateTimePicker(element.payload.fields.datetimepicker.stringValue);
                    for (part of obj) {
                        if (part.type == 1) {
                            var packet = '{"agent" : "' + "Unibo" + '", "text" : "' + msg + '","session" : "' + part.iosocket + '", "room" : "' + this.roomId + '"}';
                            this.GetSocket(part.iosocket).emit(part.handler, packet);
                        }
                    }
                }
                if (element.payload.fields.image != null && element.payload.fields.image.kind == "structValue") {
                    msg = this.CreateImage(element.payload.fields.image);
                    for (part of obj) {
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
        console.log(ts + '\t' + 'ERROR: ' + ex);
    }
}


function Utils() {
}

Utils.prototype.getdate = function (date_ob) {
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

Utils.prototype.currentdatetime = function () {
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
    let current_date = year + "" + month + "" + date + "" + hours + "" + minutes + "" + seconds
    return current_date
};

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
            this.roomList[i].ResetAllParticipiant();
            this.roomList[i].participiantArray.length = 0;
            this.roomList.splice(i,1);
            return;
        }
    }
};

ChatList.prototype.removeSession = function (sessionId) {
    for (room of this.roomList) {
        for (part of room.participiantArray) {
            if (part.iosocket == sessionId) {
                room.RemoveParticipiant(part.Name, sessionId)
                return;

            }
        }
    }
    return null;
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