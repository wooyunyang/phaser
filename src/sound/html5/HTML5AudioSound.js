var Class = require('../../utils/Class');
var BaseSound = require('../BaseSound');
var HTML5AudioSound = new Class({
    Extends: BaseSound,
    initialize: function HTML5AudioSound(manager, key, config) {
        if (config === void 0) { config = {}; }
        /**
         * An array containing all HTML5 Audio tags that could be used for individual
         * sound's playback. Number of instances depends on the config value passed
         * to the Loader#audio method call, default is 1.
         *
         * @private
         * @property {HTMLAudioElement[]} tags
         */
        this.tags = manager.game.cache.audio.get(key);
        if (!this.tags) {
            console.error('No audio loaded in cache with key: \'' + key + '\'!');
            return;
        }
        /**
         * Reference to an HTML5 Audio tag used for playing sound.
         *
         * @private
         * @property {HTMLAudioElement} audio
         * @default null
         */
        this.audio = null;
        /**
         * Timestamp as generated by the Request Animation Frame or SetTimeout
         * representing the time at which the delayed sound playback should start.
         * Set to 0 if sound playback is not delayed.
         *
         * @private
         * @property {number} startTime
         * @default 0
         */
        this.startTime = 0;
        /**
         * Audio tag's playback position recorded on previous
         * update method call. Set to 0 if sound is not playing.
         *
         * @private
         * @property {number} previousTime
         * @default 0
         */
        this.previousTime = 0;
        this.duration = this.tags[0].duration;
        this.totalDuration = this.tags[0].duration;
        BaseSound.call(this, manager, key, config);
    },
    play: function (markerName, config) {
        if (this.manager.isLocked(this, 'play', [markerName, config])) {
            return false;
        }
        if (!BaseSound.prototype.play.call(this, markerName, config)) {
            return false;
        }
        //  \/\/\/ isPlaying = true, isPaused = false \/\/\/
        if (!this.pickAndPlayAudioTag()) {
            return false;
        }
        this.emit('play', this);
        return true;
    },
    pause: function () {
        if (this.manager.isLocked(this, 'pause')) {
            return false;
        }
        if (this.startTime > 0) {
            return false;
        }
        if (!BaseSound.prototype.pause.call(this)) {
            return false;
        }
        //  \/\/\/ isPlaying = false, isPaused = true \/\/\/
        this.currentConfig.seek = this.audio.currentTime
            - (this.currentMarker ? this.currentMarker.start : 0);
        this.stopAndReleaseAudioTag();
        this.emit('pause', this);
        return true;
    },
    resume: function () {
        if (this.manager.isLocked(this, 'resume')) {
            return false;
        }
        if (this.startTime > 0) {
            return false;
        }
        if (!BaseSound.prototype.resume.call(this)) {
            return false;
        }
        //  \/\/\/ isPlaying = true, isPaused = false \/\/\/
        if (!this.pickAndPlayAudioTag()) {
            return false;
        }
        this.emit('resume', this);
        return true;
    },
    stop: function () {
        if (this.manager.isLocked(this, 'stop')) {
            return false;
        }
        if (!BaseSound.prototype.stop.call(this)) {
            return false;
        }
        //  \/\/\/ isPlaying = false, isPaused = false \/\/\/
        this.stopAndReleaseAudioTag();
        this.emit('stop', this);
        return true;
    },
    pickAndPlayAudioTag: function () {
        if (!this.pickAudioTag()) {
            this.reset();
            return false;
        }
        var seek = this.currentConfig.seek;
        var delay = this.currentConfig.delay;
        var offset = (this.currentMarker ? this.currentMarker.start : 0) + seek;
        this.previousTime = offset;
        this.audio.currentTime = offset;
        this.applyConfig();
        if (delay === 0) {
            this.startTime = 0;
            if (this.audio.paused) {
                this.playCatchPromise();
            }
        }
        else {
            this.startTime = window.performance.now() + delay * 1000;
            if (!this.audio.paused) {
                this.audio.pause();
            }
        }
        this.resetConfig();
        return true;
    },
    pickAudioTag: function () {
        if (this.audio) {
            return true;
        }
        for (var i = 0; i < this.tags.length; i++) {
            var audio = this.tags[i];
            if (audio.dataset.used === 'false') {
                audio.dataset.used = 'true';
                this.audio = audio;
                return true;
            }
        }
        if (!this.manager.override) {
            return false;
        }
        var otherSounds = [];
        this.manager.forEachActiveSound(function (sound) {
            if (sound.key === this.key && sound.audio) {
                otherSounds.push(sound);
            }
        }, this);
        otherSounds.sort(function (a1, a2) {
            if (a1.loop === a2.loop) {
                // sort by progress
                return (a2.seek / a2.duration) - (a1.seek / a1.duration);
            }
            return a1.loop ? 1 : -1;
        });
        var selectedSound = otherSounds[0];
        this.audio = selectedSound.audio;
        selectedSound.reset();
        selectedSound.audio = null;
        selectedSound.startTime = 0;
        selectedSound.previousTime = 0;
        return true;
    },
    playCatchPromise: function () {
        var playPromise = this.audio.play();
        if (playPromise) {
            playPromise.catch(function (reason) { });
        }
    },
    stopAndReleaseAudioTag: function () {
        this.audio.pause();
        this.audio.dataset.used = 'false';
        this.audio = null;
        this.startTime = 0;
        this.previousTime = 0;
    },
    reset: function () {
        BaseSound.prototype.stop.call(this);
    },
    onBlur: function () {
        this.isPlaying = false;
        this.isPaused = true;
        this.currentConfig.seek = this.audio.currentTime -
            (this.currentMarker ? this.currentMarker.start : 0);
        this.currentConfig.delay = Math.max(0, (this.startTime - window.performance.now()) / 1000);
        this.stopAndReleaseAudioTag();
    },
    onFocus: function () {
        this.isPlaying = true;
        this.isPaused = false;
        this.pickAndPlayAudioTag();
    },
    update: function (time, delta) {
        if (!this.isPlaying) {
            return;
        }
        // handling delayed playback
        if (this.startTime > 0) {
            if (this.startTime < time - this.manager.audioPlayDelay) {
                this.audio.currentTime += Math.max(0, time - this.startTime) / 1000;
                this.startTime = 0;
                this.previousTime = this.audio.currentTime;
                this.playCatchPromise();
            }
            return;
        }
        // handle looping and ending
        var startTime = this.currentMarker ? this.currentMarker.start : 0;
        var endTime = startTime + this.duration;
        var currentTime = this.audio.currentTime;
        if (this.currentConfig.loop) {
            if (currentTime >= endTime - this.manager.loopEndOffset) {
                this.audio.currentTime = startTime + Math.max(0, currentTime - endTime);
                currentTime = this.audio.currentTime;
            }
            else if (currentTime < startTime) {
                this.audio.currentTime += startTime;
                currentTime = this.audio.currentTime;
            }
            if (currentTime < this.previousTime) {
                this.emit('looped', this);
            }
        }
        else if (currentTime >= endTime) {
            this.reset();
            this.stopAndReleaseAudioTag();
            this.emit('ended', this);
            return;
        }
        this.previousTime = currentTime;
    },
    destroy: function () {
        BaseSound.prototype.destroy.call(this);
        this.tags = null;
        if (this.audio) {
            this.stopAndReleaseAudioTag();
        }
    },
    setMute: function () {
        if (this.audio) {
            this.audio.muted = this.currentConfig.mute || this.manager.mute;
        }
    },
    setVolume: function () {
        if (this.audio) {
            this.audio.volume = this.currentConfig.volume * this.manager.volume;
        }
    },
    setRate: function () {
        BaseSound.prototype.setRate.call(this);
        if (this.audio) {
            this.audio.playbackRate = this.totalRate;
        }
    }
});
/**
 * Mute setting.
 *
 * @name Phaser.Sound.HTML5AudioSound#mute
 * @property {boolean} mute
 */
Object.defineProperty(HTML5AudioSound.prototype, 'mute', {
    get: function () {
        return this.currentConfig.mute;
    },
    set: function (value) {
        this.currentConfig.mute = value;
        if (this.manager.isLocked(this, 'mute', value)) {
            return;
        }
        this.setMute();
        this.emit('mute', this, value);
    }
});
/**
 * Volume setting.
 *
 * @name Phaser.Sound.HTML5AudioSound#volume
 * @property {number} volume
 */
Object.defineProperty(HTML5AudioSound.prototype, 'volume', {
    get: function () {
        return this.currentConfig.volume;
    },
    set: function (value) {
        this.currentConfig.volume = value;
        if (this.manager.isLocked(this, 'volume', value)) {
            return;
        }
        this.setVolume();
        this.emit('volume', this, value);
    }
});
/**
 * Playback rate.
 *
 * @name Phaser.Sound.HTML5AudioSound#rate
 * @property {number} rate
 */
Object.defineProperty(HTML5AudioSound.prototype, 'rate', {
    get: function () {
        return Object.getOwnPropertyDescriptor(BaseSound.prototype, 'rate').get.call(this);
    },
    set: function (value) {
        this.currentConfig.rate = value;
        if (this.manager.isLocked(this, 'rate', value)) {
            return;
        }
        Object.getOwnPropertyDescriptor(BaseSound.prototype, 'rate').set.call(this, value);
    }
});
/**
 * Detuning of sound.
 *
 * @name Phaser.Sound.HTML5AudioSound#detune
 * @property {number} detune
 */
Object.defineProperty(HTML5AudioSound.prototype, 'detune', {
    get: function () {
        return Object.getOwnPropertyDescriptor(BaseSound.prototype, 'detune').get.call(this);
    },
    set: function (value) {
        this.currentConfig.detune = value;
        if (this.manager.isLocked(this, 'detune', value)) {
            return;
        }
        Object.getOwnPropertyDescriptor(BaseSound.prototype, 'detune').set.call(this, value);
    }
});
/**
 * Current position of playing sound.
 *
 * @name Phaser.Sound.HTML5AudioSound#seek
 * @property {number} seek
 */
Object.defineProperty(HTML5AudioSound.prototype, 'seek', {
    get: function () {
        if (this.isPlaying) {
            return this.audio.currentTime -
                (this.currentMarker ? this.currentMarker.start : 0);
        }
        else if (this.isPaused) {
            return this.currentConfig.seek;
        }
        else {
            return 0;
        }
    },
    set: function (value) {
        if (this.manager.isLocked(this, 'seek', value)) {
            return;
        }
        if (this.startTime > 0) {
            return;
        }
        if (this.isPlaying || this.isPaused) {
            value = Math.min(Math.max(0, value), this.duration);
            if (this.isPlaying) {
                this.previousTime = value;
                this.audio.currentTime = value;
            }
            else if (this.isPaused) {
                this.currentConfig.seek = value;
            }
            this.emit('seek', this, value);
        }
    }
});
/**
 * Property indicating whether or not
 * the sound or current sound marker will loop.
 *
 * @name Phaser.Sound.HTML5AudioSound#loop
 * @property {boolean} loop
 */
Object.defineProperty(HTML5AudioSound.prototype, 'loop', {
    get: function () {
        return this.currentConfig.loop;
    },
    set: function (value) {
        this.currentConfig.loop = value;
        if (this.manager.isLocked(this, 'loop', value)) {
            return;
        }
        if (this.audio) {
            this.audio.loop = value;
        }
        this.emit('loop', this, value);
    }
});
module.exports = HTML5AudioSound;