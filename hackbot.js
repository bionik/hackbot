//Create configuration object
var config = {
  channels: ['#hacklabturku'],
  server: 'open.ircnet.net',
  botName: 'hackbot',
  wunderground_api_key: '69c0d907f31cc084',
  apiLocation: 'http://localhost/pi_api/'
};

//Load libraries
var http = require('http');
var irc = require('irc');
var u = require('underscore');
var m = require('moment');

var io = require('socket.io').listen(8008);
io.set( 'origins', '*:*' );

io.on('connection', function(io){
  console.log('Dash connected!');

  io.emit('packet', {
    type: 'status',
    data: {
      time: m().format('HH:mm:ss'),
      message: 'Connected to hackbot'
    }
  });

});

//Initialize bot object
var bot = new irc.Client(config.server, config.botName, {
  channels: config.channels
});

//Check for command and return parameters
function checkCommand(command, text){
  var text_trimmed = text.replace(/\s+/g,' ').trim();
  var parameters = text_trimmed.split(' ');
  //Check for command
  if(parameters[0] === command){
    if(parameters.length > 1){
      console.log(parameters);
      parameters.shift();
      //Return parameters, first removed.
      return parameters;
    }
    return [];
  }
  return false;
}

//Function to perform a http GET request
function get(url, success, error) {
  console.log(url);
  http.get(url, function(res) {
    body = "";
    res.on('data', function (chunk) {
      body += chunk;
    });
    res.on('end', function () {
      success(JSON.parse(body));
    });
  }).on('error', function(e) {
    error(e);
  });
}

//Add a listener for incoming message
bot.addListener('message', function(from, to, text, messageObj) {
  //from: user, to: channel or nick, text: text, message: object
  var params = [];

  if(config.channels.indexOf(to) !== -1){
    console.log("Broadcast message");

    var data, type;
    var message = text;

    params = [];
    if ((params = checkCommand('!notify', text)) !== false){
      type = 'notification';
      data = {
        time: m().format('HH:mm:ss'),
        nick: from,
        message: message.substr(message.indexOf(' ') + 1)
      };

    } else {
      type = 'message';
      data = {
        time: m().format('HH:mm:ss'),
        nick: from,
        message: message
      };

    }

    io.sockets.emit('packet', {
      type: type,
      data: data
    });

  }

  console.log("Got message");

  params = [];

  //Respond to own name
  if ((params = checkCommand(config.botName, text)) !== false){
    console.log(config.botName);
    bot.say(from, 'Hi! Write help for available commands.');

  //Respond to "help", if sent directly to me (msg)
  } else if(to == config.botName && (params = checkCommand('help', text)) !== false) {
    console.log('help');
    bot.say(from, 'For now, you can use the following commands:');
    bot.say(from, '!hacklab - Displays current status of the lab');
    bot.say(from, '!w [city] - Displays current weather info');

  //Weather command
  } else if ((params = checkCommand('!w', text)) !== false){
    console.log('!w');

    //Default query
    var query = 'turku';

    if(typeof params[0] != 'undefined'){
      query = params[0];
    }

    get('http://api.wunderground.com/api/'+config.wunderground_api_key+'/conditions/q/FI/'+query+'.json', function(response){
      var output = '';

      if (typeof response.response != "undefined" && typeof response.response.error != "undefined"){
        output = 'Can\'t find such a place in Finland.';

      } else if (typeof response.response != "undefined" && typeof response.current_observation != "undefined"){
        var town = response.current_observation.display_location.city;
        var temp = response.current_observation.temp_c;
        output = 'Temperature in '+town+' is '+temp+'°C';

      } else {
        console.log('ERROR: Could not fetch data!');
        output = 'ERROR: Could not fetch data! Sorry :(';

      }

      //Send to channel or nick?
      if (to == config.botName) {
        bot.say(from, output);
      } else {
        bot.say(to, output);

        io.sockets.emit('packet', {
          type: type,
          data: { time: m().format('HH:mm:ss'), nick: config.botName, message: output }
        });
      }

    }, function(){
        console.log('ERROR: Could not fetch data!');
        bot.say(from, 'ERROR: Could not fetch data! Sorry :(');

    });

  //Respond to "!hacklab"
  } else if ((params = checkCommand('!hacklab', text)) !== false){
    console.log('!hacklab');
    var error = false;

    //Init variables
    var room1;
    var room2;
    var temperature;

    //Wait until finished is called 3 times
    var finished = u.after(3, function(){
      console.log('Success fetching all data!');
      //If no errors...
      if(!error){
        //Init output text
        var output = '';

        //Format & round temperature text
        var temp = 'Temperature is '+(Math.round(temperature.data*10)/10)+'°C';

        console.log(typeof room1.data);

        //Output logic...
        if(room1.data === '1' && room2.data === '1'){
          output = 'Lights are off. Hacklab is probably empty. '+temp;
        } else if (room1.data === '1' && room2.data === '0'){
          output = 'Lights are on in the electronics room. '+temp;
        } else if (room1.data === '0' && room2.data === '1'){
          output = 'Lights are on in the mechanics room. '+temp;
        } else if (room1.data === '0' && room2.data === '0'){
          output = 'Lights are on in both rooms! '+temp;
        }

        //Send to channel or nick?
        if (to == config.botName) {
          bot.say(from, output);
        } else {
          bot.say(to, output);

          io.sockets.emit('packet', {
            type: type,
            data: { time: m().format('HH:mm:ss'), nick: config.botName, message: output }
          });
        }

      } else {
        //Print error
        console.log('ERROR: Could not fetch data!');
        bot.say(from, 'ERROR: Could not fetch data! Sorry :(');
      }

    });

    //The following get requests call finished. When it's called three times,
    //we know the queries are complete and can start outputting.

    //Fetch room 1
    get(config.apiLocation+'gpio/?a=readPin&pin=0', function(response){
      console.log(response);
      room1 = response;
      finished();
    }, function(){
      error = true;
      finished();
    });

    //Fetch room 2
    get(config.apiLocation+'gpio/?a=readPin&pin=1', function(response){
      console.log(response);
      room2 = response;
      finished();
    }, function(){
      error = true;
      finished();
    });

    //Fetch temperature data
    get(config.apiLocation+'temp/?a=getTemp', function(response){
      console.log(response);
      temperature = response;
      finished();
    }, function(){
      error = true;
      finished();
    });

  }

});

//Catch errors
bot.addListener('error', function(message) {
    console.log('ERROR: ', message);
});
