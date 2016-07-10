//Create configuration object
var config = {
  debug: true,
  channels: ['#turku.hacklab.fi'],
  server: 'adams.freenode.net',
  botName: 'hackbot',
  wunderground_api_key: '69c0d907f31cc084',
  apiLocation: 'http://localhost/pi_api/'
//  pingTimeout: 6*60,
//  pingCheckInterval: 30
};

//Load libraries
var sys = require('sys')
var exec = require('child_process').exec;

var http = require('http');
var irc = require('irc');
var u = require('underscore');
var m = require('moment');

function log(obj){
  if(config.debug && console.log !== undefined) {
    var now = new Date();
    var timestamp = '[' + now.toISOString() + ']: ';
    if(typeof obj == 'string' || typeof obj == 'number'){
      console.log(timestamp + obj);
    } else {
      console.log(timestamp);
      console.log(obj);
    }
  }
}

Hackbot = function(){
  'use strict';
  var h = this;

  //h.lastPing = 0;

  /*h.checkPingTimeout = function(){
    var now = Date.now() / 1000;
    if(h.lastPing !== 0){
      if(now - h.lastPing >= config.pingTimeout){
        //Time passed since last ping is larger than ping timeout treshold. We have a ping timeout.

        h.sendStatus('IRC connection timed out. Reconnecting...');

        //Kill process.
        process.exit(1);
      }
    }
  };*/

  h.renderStops = function(data){
    var text = [];
    for(var i = 0; i < 3; i++){
      var d = data[i];
      if(typeof d !== "undefined"){
        text.push(d.time+' '+d.line+' '+d.dest);
      }
    }
    return text.join(' - ');
  };

  //Check for command and return parameters
  h.checkCommand = function(command, text){
    var text_trimmed = text.replace(/\s+/g,' ').trim();
    var parameters = text_trimmed.split(' ');
    //Check for command
    if(parameters[0] === command){
      if(parameters.length > 1){
        log(parameters);
        parameters.shift();
        //Return parameters, first removed.
        return parameters;
      }
      return [];
    }
    return false;
  };

  //Function to perform a http GET request
  h.get = function(url, success, error) {
    log(url);
    http.get(url, function(res) {
      var body = "";
      res.on('data', function (chunk) {
        body += chunk;
      });
      res.on('end', function () {
        success(JSON.parse(body));
      });
    }).on('error', function(e) {
      error(e);
    });
  };

  h.sendStatus = function(message){
    h.io.emit('packet', {
      type: 'status',
      data: {
        time: m().format('HH:mm:ss'),
        message: message
      }
    });
  };

  h.init = function(){
    h.io = require('socket.io').listen(8008);
    h.io.set( 'origins', '*:*' );

    h.io.on('connection', function(io){
      log('Dash connected!');
      h.sendStatus('Dashboard connected');
    });

    //Initialize bot object
    h.bot = new irc.Client(config.server, config.botName, {
      channels: config.channels,
      encoding: 'UTF-8',
      userName: 'hackbot',
      realName: 'Turku Hacklab IRC bot'
    });

    //Set ping timeout checking
    //h.lastPing = Date.now() / 1000;
    //setInterval(h.checkPingTimeout, config.pingCheckInterval);

    //Catch errors
    h.bot.addListener('error', function(message) {
      log('ERROR:');
      log(message);
    });

    /*h.bot.addListener('ping', function(message) {
      log('Got ping!');
      h.lastPing = Date.now() / 1000;
    });*/

    //Add a listener for incoming message
    h.bot.addListener('message', function(from, to, text, messageObj) {
      //from: user, to: channel or nick, text: text, message: object
      log("Got message");

      var params = [];

      //Emit message to dash, if it is sent to a channel
      if(config.channels.indexOf(to) !== -1){
        log("Broadcast message");

        var data, type;
        var message = text;
  
        params = [];
        if ((params = h.checkCommand('!notify', text)) !== false){
          type = 'notification';
          data = {
            time: m().format('HH:mm:ss'),
            nick: from,
            message: message.substr(message.indexOf(' ') + 1)
          };

          //Play sound
          exec("mpg123 /home/late/stuff/found.mp3", function(error, stdout, stderr){
            log("Played sound");
          });

        } else {
          type = 'message';

          var parsed_message = message;

          data = {
            time: m().format('HH:mm:ss'),
            nick: from,
            message: parsed_message
          };

        }

        //Send message to dash
        h.io.sockets.emit('packet', {type: type, data: data});

      }

      //Check commands
      params = [];
      var error;
      var query;
      var finished;

      //Respond to own name
      if ((params = h.checkCommand(config.botName, text)) !== false){
        log(config.botName);
        h.bot.say(from, 'Hi! Write help for available commands.');

      //Respond to "help", if sent directly to me (msg)
      } else if(to == config.botName && (params = h.checkCommand('help', text)) !== false) {
        log('help');
        h.bot.say(from, 'For now, you can use the following commands:');
        h.bot.say(from, '!bus [stop] - Displays bus stop timetables');
        h.bot.say(from, '!hacklab - Displays current status of the lab');
        //h.bot.say(from, '!heater [on/off] - Controls and displays the status of the heater');
        h.bot.say(from, '!stream [stop/URL] - Controls music player');
        h.bot.say(from, '!w [city] - Displays current weather info');

      //Bus command
      } else if ((params = h.checkCommand('!bus', text)) !== false){
        log('!bus');

        if(typeof params[0] != 'undefined'){
          query = params[0];

          h.get(config.apiLocation+'folistop/?a=getStop&stop='+query, function(response){
            log(response);

            if(response.status == "OK"){
              var output = '['+response.stop+'] '+h.renderStops(response.data);

              if (to == config.botName) {
                h.bot.say(from, output);
              } else {
                h.bot.say(to, output);

                h.io.sockets.emit('packet', {
                  type: type,
                  data: { time: m().format('HH:mm:ss'), nick: config.botName, message: output }
                });
              }

            } else {
              //Print error
              log('ERROR: Could not fetch data!');
              h.bot.say(from, 'ERROR: Could not fetch data! Sorry :(');
            }

          }, function(){
            //Print error
            log('ERROR: Could not fetch data!');
            h.bot.say(from, 'ERROR: Could not fetch data! Sorry :(');
          });

        } else {

          error = false;
          var stop1;
          var stop2;

          finished = u.after(2, function(){
            log('Finished fetching data');

            if(!error && stop1.status == "OK" && stop2.status == "OK"){

              var output = '['+stop1.stop+'] '+h.renderStops(stop1.data)+' ['+stop2.stop+'] '+h.renderStops(stop2.data);

              if (to == config.botName) {
                h.bot.say(from, output);
              } else {
                h.bot.say(to, output);

                h.io.sockets.emit('packet', {
                  type: type,
                  data: { time: m().format('HH:mm:ss'), nick: config.botName, message: output }
                });
              }

            } else {
              //Print error
              log('ERROR: Could not fetch data!');
              h.bot.say(from, 'ERROR: Could not fetch data! Sorry :(');
            }

          });

          //Fetch stop 264
          h.get(config.apiLocation+'folistop/?a=getStop&stop=264', function(response){
            log(response);
            stop1 = response;
            finished();
          }, function(){
            error = true;
            finished();
          });

          //Fetch stop 662
          h.get(config.apiLocation+'folistop/?a=getStop&stop=662', function(response){
            log(response);
            stop2 = response;
            finished();
          }, function(){
            error = true;
            finished();
          });

        }

      } else if ((params = h.checkCommand('!w', text)) !== false){
        log('!w');

        //Default query
        query = 'turku';

        if(typeof params[0] != 'undefined'){
          query = params[0];
        }

        h.get('http://api.wunderground.com/api/'+config.wunderground_api_key+'/conditions/q/FI/'+query+'.json', function(response){
          var output = '';

          if (typeof response.response != "undefined" && typeof response.response.error != "undefined"){
            output = 'Can\'t find such a place in Finland.';

          } else if (typeof response.response != "undefined" && typeof response.current_observation != "undefined"){
            var town = response.current_observation.display_location.city;
            var temp = response.current_observation.temp_c;
            output = 'Temperature in '+town+' is '+temp+'°C';

          } else {
            log('ERROR: Could not fetch data!');
            output = 'ERROR: Could not fetch data! Sorry :(';

          }

          //Send to channel or nick?
          if (to == config.botName) {
            h.bot.say(from, output);

          } else {
            h.bot.say(to, output);

            h.io.sockets.emit('packet', {
              type: type,
              data: { time: m().format('HH:mm:ss'), nick: config.botName, message: output }
            });
          }

        }, function(){
            log('ERROR: Could not fetch data!');
            h.bot.say(from, 'ERROR: Could not fetch data! Sorry :(');

        });

      //Respond to "!hacklab"
      } else if ((params = h.checkCommand('!hacklab', text)) !== false){
        log('!hacklab');
        error = false;

        //Init variables
        var room1;
        var room2;
        var temperature;
        var humidity;
        var pir;

        //Wait until finished is called 4 times
        finished = u.after(5, function(){
          log('Success fetching all data!');
          //If no errors...
          if(!error){
            //Init output text
            var output = '';

            //Format & round temperature text
            var temperature_text = 'Temperature is '+(Math.round(temperature.data*10)/10)+'°C';

            //Format humidity text
            var humidity_text = 'Humidity is '+(humidity.data)+'%';

            //Output logic...
            if(room1.data === '1' && room2.data === '1'){
              output = 'Lights are off. Hacklab is probably empty.';
            } else if (room1.data === '1' && room2.data === '0'){
              output = 'Lights are on in the electronics room.';
            } else if (room1.data === '0' && room2.data === '1'){
              output = 'Lights are on in the mechanics room.';
            } else if (room1.data === '0' && room2.data === '0'){
              output = 'Lights are on in both rooms!';
            }

            output += ' Last movement at '+pir.time+'. '+temperature_text+'. '+humidity_text;

            //Send to channel or nick?
            if (to == config.botName) {
              h.bot.say(from, output);
            } else {
              h.bot.say(to, output);

              h.io.sockets.emit('packet', {
                type: type,
                data: { time: m().format('HH:mm:ss'), nick: config.botName, message: output }
              });
            }

          } else {
            //Print error
            log('ERROR: Could not fetch data!');
            h.bot.say(from, 'ERROR: Could not fetch data! Sorry :(');
          }

        });

        //The following get requests call finished. When it's called three times,
        //we know the queries are complete and can start outputting.

        //Fetch room 1
        h.get(config.apiLocation+'gpio/?a=readPin&pin=0', function(response){
          log(response);
          room1 = response;
          finished();
        }, function(){
          error = true;
          finished();
        });

        //Fetch room 2
        h.get(config.apiLocation+'gpio/?a=readPin&pin=1', function(response){
          log(response);
          room2 = response;
          finished();
        }, function(){
          error = true;
          finished();
        });

        //Fetch PIR
        h.get(config.apiLocation+'pir/?a=getStatus', function(response){
          log(response);
          pir = response;
          finished();
        }, function(){
          error = true;
          finished();
        });

        //Fetch temperature data
        h.get(config.apiLocation+'temp/?a=getTemp', function(response){
          log(response);
          temperature = response;
          finished();
        }, function(){
          error = true;
          finished();
        });

        //Fetch humidity data
        h.get(config.apiLocation+'humidity/?a=getHumidity', function(response){
          log(response);
          humidity = response;
          finished();
        }, function(){
          error = true;
          finished();
        });


      } else if ((params = h.checkCommand('!stream', text)) !== false){
        log('!stream');

        if(params[0] !== 'undefined' && params[0] === 'stop'){
          //Stopping stream
          h.get(config.apiLocation+'stream/?a=stopStream', function(response){
            log(response);
            if (response.status !== undefined && response.status === 'OK'){
              h.sendStatus('Stream stopped');

            } else {
              //Print error
              log('ERROR: API call failed!');
              h.bot.say(from, 'ERROR: API call failed! Sorry :(');

            }
          }, function(){
            //Print error
            log('ERROR: Could not send data!');
            h.bot.say(from, 'ERROR: Could not send data! Sorry :(');

          });

        } else if (params[0] !== 'undefined') {
          var stream = params[0];

          //Starting stream
          h.get(config.apiLocation+'stream/?a=playStream&stream='+stream, function(response){
            log(response);
            if (response.status !== undefined && response.status === 'OK'){
              h.sendStatus('Stream started');

            } else {
              //Print error
              log('ERROR: API call failed!');
              h.bot.say(from, 'ERROR: API call failed! Sorry :(');

            }
          }, function(){
            //Print error
            log('ERROR: Could not send data!');
            h.bot.say(from, 'ERROR: Could not send data! Sorry :(');

          });
        } else {
          log('ERROR: Incorrect parameters.');
          h.bot.say(from, 'ERROR: Incorrect parameters.');
        }

      } /*else if ((params = h.checkCommand('!heater', text)) !== false){
        log('!heater');

        if(params[0] !== 'undefined' && params[0] === 'off'){
          //Stopping stream
          h.get(config.apiLocation+'heater/?a=stopHeater', function(response){
            log(response);
            if (response.status !== undefined && response.status === 'OK'){

              //h.sendStatus('Turned heater off');
              var output = 'Turned heater off';

              //Send to channel or nick?
              if (to == config.botName) {
                h.bot.say(from, output);
              } else {
                h.bot.say(to, output);

                h.io.sockets.emit('packet', {
                  type: type,
                  data: { time: m().format('HH:mm:ss'), nick: config.botName, message: output }
                });
              }

            } else {
              //Print error
              log('ERROR: API call failed!');
              h.bot.say(from, 'ERROR: API call failed! Sorry :(');
            }
          }, function(){
            //Print error
            log('ERROR: Could not send data!');
            h.bot.say(from, 'ERROR: Could not send data! Sorry :(');
          });

        } else if(params[0] !== 'undefined' && params[0] === 'on'){
          //Stopping heater
          h.get(config.apiLocation+'heater/?a=startHeater', function(response){
            log(response);
            if (response.status !== undefined && response.status === 'OK'){

              //h.sendStatus('Turned heater ON');
              var output = 'Turned heater on';

              //Send to channel or nick?
              if (to == config.botName) {
                h.bot.say(from, output);
              } else {
                h.bot.say(to, output);

                h.io.sockets.emit('packet', {
                  type: type,
                  data: { time: m().format('HH:mm:ss'), nick: config.botName, message: output }
                });
              }

            } else {
              //Print error
              log('ERROR: API call failed!');
              h.bot.say(from, 'ERROR: API call failed! Sorry :(');

            }
          }, function(){
            //Print error
            log('ERROR: Could not send data!');
            h.bot.say(from, 'ERROR: Could not send data! Sorry :(');

          });

        } else {
          //Getting heater status

          var heaterPin = 2;

          h.get(config.apiLocation+'heater/?a=getStatus', function(response){
            log(response);
            if (response.status !== undefined && response.status === 'OK'){

              var heater_status = 'off';
              if(response.heater.state == "on") {
                var start_time = m.unix(response.heater.started).format('HH:mm:ss');
                heater_status = 'on. Turned on at '+start_time;
              }

              var output = "Heater is currently "+heater_status;

              //Send to channel or nick?
              if (to == config.botName) {
                h.bot.say(from, output);
              } else {
                h.bot.say(to, output);

                h.io.sockets.emit('packet', {
                  type: type,
                  data: { time: m().format('HH:mm:ss'), nick: config.botName, message: output }
                });
              }

            } else {
              //Print error
              log('ERROR: API call failed!');
              h.bot.say(from, 'ERROR: API call failed! Sorry :(');

            }
          }, function(){
            //Print error
            log('ERROR: Could not send data!');
            h.bot.say(from, 'ERROR: Could not send data! Sorry :(');
          });

        }

      }*/

    });

  };

  //Initialize
  h.init();

};

log('Instancing Hackbot');
var hackbot = new Hackbot();
