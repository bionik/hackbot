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
bot.addListener('message', function(from, to, text, message) {
  //from: user, to: channel or nick, text: text, message: object

  var params = [];

  //Respond to own name
  if ((params = checkCommand(config.botName, text)) !== false){
    bot.say(from, 'Hi! Write help for available commands.');

  //Respond to "help", if sent directly to me (msg)
  } else if(to == config.botName && (params = checkCommand('help', text)) !== false) {
    bot.say(from, 'For now, you can use the following commands:');
    bot.say(from, '!hacklab - Displays current status of the lab');
    bot.say(from, '!w [city] - Displays current weather info');

  //Weather command
  } else if ((params = checkCommand('!w', text)) !== false){

    //Default query
    var query = 'turku';

    if(typeof params[0] != 'undefined'){
      query = params[0];
    }

    get('http://api.wunderground.com/api/'+config.wunderground_api_key+'/conditions/q/FI/'+query+'.json', function(response){
      var text = '';

      if (typeof response.response != "undefined" && typeof response.response.error != "undefined"){
        text = 'Can\'t find such a place in Finland.'

      } else if (typeof response.response != "undefined" && typeof response.current_observation != "undefined"){
        var town = response.current_observation.display_location.city;
        var temp = response.current_observation.temp_c;
        text = 'Temperature in '+town+' is '+temp+'°C';

      } else {
        console.log('ERROR: Could not fetch data!');
        text = 'ERROR: Could not fetch data! Sorry :(';

      }

      //Send to channel or nick?
      if (to == config.botName) {
        bot.say(from, text);
      } else {
        bot.say(to, text);
      }

    }, function(){
        console.log('ERROR: Could not fetch data!');
        bot.say(from, 'ERROR: Could not fetch data! Sorry :(');

    });

  //Respond to "!hacklab"
  } else if ((params = checkCommand('!hacklab', text)) !== false){
    var error = false;

    //Init variables
    var room1;
    var room2;
    var temp;

    //Wait until finished is called 3 times
    var finished = u.after(3, function(){

      //If no errors...
      if(!error){
        //Init output text
        var text = '';

        //Format & round temperature text
        var temp_text = 'Temperature is '+(Math.round(temp.data*10)/10)+'°C';

        //Output logic...
        if(room1.data == 1 && room2.data == 1){
          text = 'Lights are off. Hacklab is probably empty. '+temp_text;
        } else if (room1.data == 1 && room2.data == 0){
          text = 'Lights are on in the electronics room. '+temp_text;
        } else if (room1.data == 0 && room2.data == 1){
          text = 'Lights are on in the mechanics room. '+temp_text;
        } else if (room1.data == 0 && room2.data == 0){
          text = 'Lights are on in both rooms! '+temp_text;
        }

        //Send to channel or nick?
        if (to == config.botName) {
          bot.say(from, text);
        } else {
          bot.say(to, text);
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
      temp = response;
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
