var format = require('util').format,
    readline = require('readline'),
    rl = readline.createInterface(process.stdin, process.stdout),
    zmq = require('zmq'),
    rq = zmq.socket('req'),
    timeSub = zmq.socket('sub');
    beginPlaySub = zmq.socket('sub');


rq.connect(format('tcp://%s:5555', process.argv[2]));
timeSub.connect(format('tcp://%s:5556', process.argv[2]));
timeSub.subscribe('TIMEPOS');

var currentTrackComments = [];
rq.on("message", function(reply) {
    
    var jsonReply = JSON.parse(reply.toString());

    switch(jsonReply.command) {
        case 'getCurrentTrack': {
            
            currentTrackComments = jsonReply.data.comments || [];

        }; break;
    }
    
    // rl.prompt();

});

timeSub.on('message', function(timeString) {
    // console.log(time.toString());
    // rl.prompt();
    var timestampString = timeString.toString().split(' ')[1],
        timeIndex = timestampString.substr(0, timestampString.length - 2);;
    
    if (currentTrackComments[timeIndex] !== undefined) {
        currentTrackComments[timeIndex].forEach(function(comment){
            console.log(comment.body);
        });
    } 
});


rl.setPrompt('♪ ');
rl.prompt();

rl.on('line', function(line) {

    var inputArray = line.toString().trimRight().split(' '),
        command = inputArray[0], params = {};

    if (inputArray[1] !== undefined) {

        var param = inputArray[1].split(':');
        params[param[0]] = param[1];
    }

    var request = JSON.stringify({ name: command, params: params });

    rq.send(request);

    // rl.prompt();

}).on('close', function() {
  
    console.log('Have a great day!');
    process.exit(0);

});
