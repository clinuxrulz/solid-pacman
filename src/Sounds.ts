import { Howl } from "howler";

type Sound =
    "Chomp" |
    "Cutscene" |
    "Death" |
    "Extra" |
    "Fruit" |
    "Ghost" |
    "Intro";

export class Sounds {
    private sounds: {
        sound: Sound,
        audio: Howl,
        dispose: () => void,
    }[];
    private soundMap: Map<Sound,{
        sound: Sound,
        audio: Howl,
        dispose: () => void,
    }>;

    private constructor(sounds: {
        sound: Sound,
        audio: Howl,
        dispose: () => void,
    }[]) {
        this.sounds = sounds;
        this.soundMap = new Map(sounds.map((sound) => [ sound.sound, sound, ]));
    }

    playSound(sound: Sound) {
        let audio = this.soundMap.get(sound)?.audio;
        if (audio == undefined) {
            return;
        }
        audio.play();
    }

    stopSound(sound: Sound) {
        let audio = this.soundMap.get(sound)?.audio;
        if (audio == undefined) {
            return;
        }
        audio.pause();
    }

    isPlayingSound(sound: Sound) {
        let audio = this.soundMap.get(sound)?.audio;
        if (audio == undefined) {
            return;
        }
        return audio.playing();
    }

    static async load(): Promise<Sounds> {
        const soundsToLoad: [Sound,string][] = [
            ["Chomp", "Chomp.mp3"],
            ["Cutscene", "Cutscene.mp3"],
            ["Death", "Death.mp3"],
            ["Extra", "Extra.mp3"],
            ["Fruit", "Fruit.mp3"],
            ["Ghost", "Ghost.mp3"],
            ["Intro", "Intro.mp3"],
        ];
        let sounds = await Promise.all(
            soundsToLoad.map(async ([ sound, file ]) => {
                let audio = new Howl({ src: [ file, ], });
                let dispose = () => {
                    // ??
                };
                return {
                    sound,
                    audio,
                    dispose,
                };
            })
        );
        return new Sounds(sounds);
    }
}
