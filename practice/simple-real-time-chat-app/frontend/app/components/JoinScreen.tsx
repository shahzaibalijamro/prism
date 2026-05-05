// frontend/components/JoinScreen.jsx
"use client";
import axios from "axios";
import { useEffect, useState } from "react";
import { serverURL } from "../hooks/useSocket";

export function JoinScreen({ onJoin } : {onJoin: (username: string, room: string) => void}) {
    const [username, setUsername] = useState("");
    const [selectedRoom, setSelectedRoom] = useState("general");
    const [rooms, setRooms] = useState<string[] | []>([]);
    const [loading, setLoading] = useState<boolean>(true);

    const handleJoin = () => {
        if (!username.trim()) return;
        onJoin(username.trim(), selectedRoom);
    };

    useEffect(() => {
        fetchRooms();
    }, []);

    const fetchRooms = async () => {
        try {
            const { data } = await axios.get(`${serverURL}/rooms`);
            setRooms(data.rooms);
        } catch (error) {
            console.log(error);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div style={{ maxWidth: 400, margin: "100px auto", padding: 24 }}>
            <h1>Socket.io Chat</h1>

            <div style={{ marginBottom: 16 }}>
                <label>Your username</label>
                <input
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleJoin()}
                    placeholder="Shahzaib"
                    style={{ display: "block", width: "100%", padding: 8, marginTop: 4 }}
                />
            </div>

            <div style={{ marginBottom: 16 }}>
                <label>Choose a room</label>
                <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                    {!loading && rooms.length > 0 ? rooms.map((room) => (
                        <button
                            key={room}
                            onClick={() => setSelectedRoom(room)}
                            style={{
                                padding: "8px 16px",
                                background: selectedRoom === room ? "#0070f3" : "#eee",
                                color: selectedRoom === room ? "white" : "black",
                                border: "none",
                                borderRadius: 4,
                                cursor: "pointer",
                            }}
                        >
                            #{room}
                        </button>
                    )) : 
                    !loading && rooms.length === 0 ? <div>Something went wrong</div>
                    : <div className="">Loading</div>
                    }
                </div>
             </div>
            <button
                    onClick={handleJoin}
                    style={{
                        width: "100%",
                        padding: 12,
                        background: "#0070f3",
                        color: "white",
                        border: "none",
                        borderRadius: 4,
                        cursor: "pointer",
                    }}
                >
                    Join #{selectedRoom}
            </button>
        </div>
    );
}
