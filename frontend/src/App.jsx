import { useRef, useEffect, useState } from "react";
import { io } from "socket.io-client"
export default function App() {
    const socketRef = useRef(null);
    const [songs, setSongs] = useState([]);
    const [currentSong, setCurrentSong] = useState("");
    const [searchTerm, setSearchTerm] = useState("");

    const [progress, setProgress] = useState(0);
    const [isPlaying, setIsPlaying] = useState(false);

    const isSeekingRef = useRef(false);
    const audioRef = useRef(null);

    const [loading, setLoading] = useState(false);

    const [songName, setSongName] = useState("");
    const [artistName, setArtistName] = useState("");

    useEffect(() => {
        if (currentSong === "") return
        console.log("current song ", currentSong)
        socketRef.current.emit("change_current_song", currentSong)
    }, [currentSong])

    useEffect(() => {
        socketRef.current = io("https://musicsync-si4a.onrender.com/")
        socketRef.current.on("connect", () => {
            console.log("socket connected")
        })

        socketRef.current.on("update_current_song", (data) => {
            setCurrentSong(data)
        })

        socketRef.current.on("pause_song", () => {
            audioRef.current.pause();
            setIsPlaying(false);
        })

        socketRef.current.on("play_song", () => {
            audioRef.current.play();
            setIsPlaying(true);
        })
        return () => {
            socketRef.current.disconnect()
        }
    }, [])

    const fetchSongs = async () => {
        const res = await fetch("http://localhost:5000/songs");
        const data = await res.json();
        setSongs(data);
    };

    useEffect(() => {
        fetchSongs();
    }, []);

    useEffect(() => {
        const audio = audioRef.current;
        if (!audio) return;

        const update = () => {
            if (isSeekingRef.current) return;
            setProgress((audio.currentTime / audio.duration) * 100 || 0);
        };

        audio.addEventListener("timeupdate", update);
        return () => audio.removeEventListener("timeupdate", update);
    }, [currentSong]);

    useEffect(() => {
        const audio = audioRef.current;
        if (!audio) return;

        if (currentSong) {
            audio.play();
            setIsPlaying(true);
            setProgress(0);
        }
    }, [currentSong]);

    return (
        <div className="m-2 flex flex-col gap-4">

            <div className="flex gap-4">
                <input
                    type="text"
                    value={songName}
                    onChange={(e) => setSongName(e.target.value)}
                    placeholder="Song"
                    className="border-2 border-black rounded-lg w-[8rem] p-2"
                />
                <input
                    type="text"
                    value={artistName}
                    onChange={(e) => setArtistName(e.target.value)}
                    placeholder="Artist"
                    className="border-2 border-black rounded-lg w-[8rem] p-2"
                />
            </div>

            <button
                className="bg-gray-300 rounded-lg cursor-pointer p-2 w-max"
                onClick={async () => {
                    if (songName.trim() && artistName.trim()) setLoading(true);

                    await fetch("http://localhost:3000/download", {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json",
                        },
                        body: JSON.stringify({
                            song: songName,
                            artist: artistName,
                        }),
                    });

                    await fetchSongs();
                    setLoading(false);
                }}
            >
                Get Song
            </button>

            <input
                type="text"
                placeholder="search in library"
                className="border-2 border-black rounded-lg w-[15rem] p-2"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
            />

            {loading && <div>Loading...</div>}

            <div className="h-[25rem] border-2 border-black rounded-lg overflow-scroll p-2 flex flex-col gap-4">
                {songs
                    .filter((song) =>
                        song.toLowerCase().includes(searchTerm.toLowerCase())
                    )
                    .map((song, id) => (
                        <div
                            key={id}
                            className="cursor-pointer bg-gray-300 p-2 rounded-lg text-xl w-max"
                            onClick={() => setCurrentSong(song)}
                        >
                            {song}
                        </div>
                    ))}
            </div>

            {currentSong && (
                <div className="flex gap-4 items-center">

                    <audio
                        ref={audioRef}
                        src={`http://localhost:5000/music/${currentSong}`}
                    />

                    <button
                        className="bg-gray-300 rounded-lg p-2"
                        onClick={() => {
                            if (!audioRef.current) return;
                            socketRef.current.emit("play")
                            audioRef.current.play();
                            setIsPlaying(true);
                        }}
                    >
                        Play
                    </button>

                    <button
                        className="bg-gray-300 rounded-lg p-2"
                        onClick={() => {
                            if (!audioRef.current) return;
                            socketRef.current.emit("pause")
                            audioRef.current.pause();
                            setIsPlaying(false);
                        }}
                    >
                        Pause
                    </button>

                    <input
                        type="range"
                        value={progress}
                        onMouseDown={() => {
                            isSeekingRef.current = true;
                        }}
                        onMouseUp={(e) => {
                            const audio = audioRef.current;
                            if (!audio) return;

                            const value = Number(e.target.value);
                            audio.currentTime =
                                (value / 100) * audio.duration;

                            isSeekingRef.current = false;
                        }}
                        onChange={(e) => {
                            setProgress(Number(e.target.value));
                        }}
                    />
                </div>
            )}
        </div>
    );
}