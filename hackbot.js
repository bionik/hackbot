//Create configuration object
var config = {
	channels: ['#hacklabturku'],
	server: 'open.ircnet.net',
	botName: 'hackbot'
};

//Load libraries
var http = require('http');
var irc = require('irc');
var u = require('underscore');

//Initialize bot object
var bot = new irc.Client(config.server, config.botName, {
	channels: config.channels
});

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

  //Respond to own name
	if (text == config.botName){
		bot.say(from, 'Hi! Write help for available commands.');

  //Respond to "help", if sent directly to me (msg)
	} else if(to == config.botName && text == 'help') {
    bot.say(from, 'For now, you can use the following commands:');
    bot.say(from, '!hacklab - Displays current status of the lab');

  //Respond to "!hacklab"
  } else if (text == '!hacklab'){
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
    get('http://localhost/gpio/?a=readPin&pin=0', function(response){
      console.log(response);
      room1 = response;
      finished();
    }, function(){
      error = true;
      finished();
    });

    //Fetch room 2
    get('http://localhost/gpio/?a=readPin&pin=1', function(response){
      console.log(response);
      room2 = response;
      finished();
    }, function(){
      error = true;
      finished();
    });

    //Fetch temperature data
    get('http://localhost/temp/?a=getTemp', function(response){
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
