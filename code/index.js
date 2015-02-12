
var daemon = require('./server').daemon,
    model = {},
    EventEmitter = new (require('events').EventEmitter)(),
    rest = require('rest'),
    querystring = require('querystring');

console.log( EventEmitter );

var mplayer,
    timePosTimeout,
    clientID = 'f5dcaf5f7c97d2996bb30bb40d23ee57',
    isPlaying = false;

function spawnMplayer(filename) {

    if (mplayer !== undefined && mplayer.stdin.writable === true) {

        clearTimeout(timePosTimeout);

        mplayer.removeAllListeners('exit');
        mplayer.stdin.write('quit\n');
    }

    mplayer = require('child_process').
        spawn('mplayer', ['-slave', '-quiet',
                          '-cache', '100',
                          '-ao','alsa',
                          '-cache-min', '10',
                          filename]);

    createTimePositionWatcher();
}

function createTimePositionWatcher() {

    var timeRegex = /^ANS_TIME_POSITION=(\d+)\.(\d+)/;

    mplayer.stdin.on('error', function(e) {
        console.log(e);
    });

    mplayer.stdout.on('data', function(chunk) {

        var matches = chunk.toString().trim().match(timeRegex);

        if (matches) {

            var timestamp = matches[1] * 1000 + matches[2] * 100;
            EventEmitter.emit('mplayer_time_pos', timestamp);
        }
    });

    requestTimePos();
}

EventEmitter.on('mplayer_time_pos', function(timePos) {
    daemon._publisher.send('TIMEPOS ' + timePos);
});

EventEmitter.on('begin_play', function() {
    daemon._processMessage(JSON.stringify({name: 'getCurrentTrack', params: {}}));
});

function requestTimePos() {

    mplayer.stdin.write('get_time_pos\n');
    timePosTimeout = setTimeout(requestTimePos, 100);
}

model.__proto__ = require('./server').model;
model._commands = {

    list: {
        name: "list",
        params: {},
        exec: function(params) {
            return fs.readdirSync('sounds');
        }

    },
    getTaggedTracks: {
        name: "getTaggedTracks",
        params: { "tag": "tag to search"},
        exec: function(params) {

            var path = 'http://api.soundcloud.com/tracks.json?',
                apiParams = querystring.stringify({
                    consumer_key: clientID,
                    tags: params.tag,
                    filter: 'streamable',
                    //order: 'created_at'
                    order: 'hotness'
                });

            return rest(path + apiParams)
                .then(function (request) { return request.entity; })
                .then(JSON.parse);
        }
    }
};

var d = daemon.create(model);
console.log('daemon creted.');

model._playlist = null;
model._currentTrackIndex = 0;

model.getComments = function (trackId) {

    var path = 'http://api.soundcloud.com/tracks/'+ trackId+'/comments.json?',
        apiParams = querystring.stringify({ consumer_key: clientID });

    return rest(path + apiParams)
        .then(function (request) { return request.entity; })
        .then(JSON.parse);

};

daemon.next = function next() {

    var playlistLength = model._playlist.length || 0;

    if (playlistLength == 0) return 0;

    model._currentTrackIndex++;

    if (model._currentTrackIndex >= playlistLength) {
        model._currentTrackIndex = 0;
    }

    daemon.play();

    return 0;

};

daemon.play = function play() {
    
    var currentTrack = model._playlist[model._currentTrackIndex];

    console.log('Playing: ' + currentTrack.title + ' ['+ currentTrack.duration +']');
    console.log('URL: ' + currentTrack.stream_url);

    var commentsPromise = model.getComments(currentTrack.id);

    commentsPromise.done(function(comments) {

        var groupedByTime = {};
        
        /* Group comments by cutted timestamp:
         * 
         *
         * e.g. if
         * comment.timestamp == 115798
         * then -->
         * groupedByTime['1157'].push( `comment` )
         *
         */

        comments.forEach(function(comment) {

            var stringTime = comment.timestamp ?
                    comment.timestamp.toString() : '0',
                timeIndex = stringTime.substr(0, stringTime.length - 2);

            if (groupedByTime[timeIndex] === undefined) {
                groupedByTime[timeIndex] = [];
            }

            groupedByTime[timeIndex].push(comment);

        });

        currentTrack.comments = groupedByTime;
        EventEmitter.emit('begin_play');
    });

    spawnMplayer(currentTrack.stream_url + "?consumer_key=" + clientID);

    mplayer.on('exit', function () {

        isPlaying = false;
        clearTimeout(timePosTimeout);
        daemon.next();
    });

    isPlaying= true;

};

daemon._commands = {

    pause: {
        name: "pause",

        exec: function(params) {

            if (isPlaying) {
                mplayer.stdin.write('pause\n');
                isPlaying = false;
            }

            return 0;
        }
    },
    resume: {
        name: "resume",

        exec: function(params) {

            if (!isPlaying) {
                mplayer.stdin.write('pause\n');
                isPlaying = true;
            }

            return 0;
        }

    },
    toggle: {
        name: "toggle",

        exec: function(params) {

            mplayer.stdin.write('pause\n');
            isPlaying = !isPlaying;

            return 0;
        }

    },
    n: {
        name: "n",

        exec: daemon.next
    },
    playIndex: {
        name: "playIndex",
        params: { index: "index of playlist element"},

        exec: function (params) {

            var index = params.index * 1 || 0;
            
            model._currentTrackIndex = index;            
            daemon.play();
            
            return 0;
            
        }
    },
    p: {
        name: "p",
        params: { 
            tag: "tag to play" 
        },

        exec: function p(params) {

            function createPlaylist (allTracks) {

                model._playlist = allTracks.filter(function hasStreamUrl(track) {
                    return track.stream_url !== undefined;
                }).sort(function (a,b) {
                    return a.duration*1 - b.duration*1;
                });
                
                model._currentTrackIndex = 0;
                
                daemon._processMessage(JSON.stringify({name: 'getPlaylist', params: {}}));

                return allTracks;
            }


            var allTracks = model.exec({

                name: "getTaggedTracks",
                params: {
                    tag: params.tag
                }
            });

            allTracks.then(createPlaylist);
            allTracks.then(daemon.play);
            allTracks.done();
            
            return 0;
        }
    },
    getCurrentTrack: {
        name: "getCurrentTrack",
        exec: function() {

            var currentTrack;

            try {
                currentTrack = model._playlist[model._currentTrackIndex];
            } catch(e) {
                return 0;
            }

            return currentTrack === undefined ? 0 : currentTrack;
        }

    },
    getPlaylist: {
        name: "getPlaylist",
        exec: function() {
            
            return model._playlist || 0;
        }

    }

};
