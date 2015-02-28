var config = {
	channels: ['#hacklabturku'],
	server: 'open.ircnet.net',
	botName: 'hackbot'
};

var http = require('http');
var irc = require('irc');
var u = require('underscore');

var bot = new irc.Client(config.server, config.botName, {
	channels: config.channels
});

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

bot.addListener('message', function(from, to, text, message) {
	//console.log(from+' '+to+' '+text+' '+message);
	//bionik #hacklabturku hackbot [object Object]

	if (text == config.botName){
		bot.say(from, 'Hi! Write help for available commands.');

	} else if(to == config.botName && text == 'help') {
    bot.say(from, 'For now, you can use the following commands:');
    bot.say(from, '!hacklab - Displays current status of the lab');

  } else if (text == '!hacklab'){
		//Check lights
		var error = false;
		var body;

    var room1;
    var room2;
    var temp;

		var finished = u.after(3, function(){
      if(!error){
        var text = '';
        var temp_text = 'Temperature is '+(Math.round(temp.data*10)/10)+'°C';

        if(room1.data == 1 && room2.data == 1){
          text = 'Lights are off. Hacklab is probably empty. '+temp_text;
        } else if (room1.data == 1 && room2.data == 0){
          text = 'Lights are on in the electronics room. '+temp_text;
        } else if (room1.data == 0 && room2.data == 1){
          text = 'Lights are on in the mechanics room. '+temp_text;
        } else if (room1.data == 0 && room2.data == 0){
          text = 'Lights are on in both rooms! '+temp_text;
        }

        if (to == config.botName) {
          bot.say(from, text);
        } else {
          bot.say(to, text);
        }

      } else {
        console.log('ERROR: Could not fetch data!');
        bot.say(from, 'ERROR: Could not fetch data! Sorry :(');
      }

		});

    get('http://localhost/gpio/?a=readPin&pin=0', function(response){
      console.log(response);
      room1 = response;
      finished();
    }, function(){
      error = true;
      finished();
    });

    get('http://localhost/gpio/?a=readPin&pin=1', function(response){
      console.log(response);
      room2 = response;
      finished();
    }, function(){
      error = true;
      finished();
    });

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

bot.addListener('error', function(message) {
    console.log('ERROR: ', message);
});
