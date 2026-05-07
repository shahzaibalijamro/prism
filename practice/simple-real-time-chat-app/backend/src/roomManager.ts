interface Room {
  users: {
    [id: string]: string;
  };
}

interface Rooms {
  [roomName: string]: Room;
}

const rooms: Rooms = {};

const DEFAULT_ROOMS = ["General", "Tech-Talk", "Economists", "Politics", "Environment"];

for (const name of DEFAULT_ROOMS) {
  rooms[name.toLowerCase()] = { users: {} };
}

export const joinRoom = (
  username: string,
  socketId: string,
  roomName: string,
) => {
  if (!rooms[roomName]) {
    rooms[roomName] = { users: {} };
  }
  rooms[roomName].users[socketId] = username;
};

export const leaveRoom = (socketId: string, roomName: string) => {
  if (rooms[roomName]) {
    if (rooms[roomName].users[socketId]) delete rooms[roomName].users[socketId];
  }
};

export const removeFromAllRooms = (socketId: string) => {
  const affectedRooms: [obj?: { roomName: string; username: string }] = [];
  Object.keys(rooms).forEach((roomName) => {
    if (rooms[roomName]?.users[socketId]) {
      const username = rooms[roomName]?.users[socketId];
      delete rooms[roomName]?.users[socketId];
      affectedRooms.push({ roomName, username });
    }
  });
  return affectedRooms;
};

export const getUsersInARoom = (roomName: string) => {
  if (!rooms[roomName]) return [];
  return Object.values(rooms[roomName].users);
};

export const getRoomNames = () => {
  return Object.keys(rooms);
};

export const getUserNameBySocketId = (socketId: string, room: string) => {
  if (rooms[room]?.users[socketId]) {
    return rooms[room]?.users[socketId];
  }
  return null;
};

// {
//   "general": {
//     users: { "socket_id_abc": "Shahzaib", "socket_id_xyz": "Ali" }
//   },
//   "tech-talk": {
//     users: { "socket_id_def": "Sara" }
//   }
// }
