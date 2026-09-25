function generatePin(rooms) {
  let pin;

  do {
    pin = Math.floor(1000 + Math.random() * 9000).toString();
  } while (rooms[pin]);

  return pin;
}

module.exports = function lobbyHandler(io, socket, rooms) {

  socket.on("quiz:create", ({ hostName, category }) => {

    const pin = generatePin(rooms);

    rooms[pin] = {
      pin,
      roomId: `quiz_${pin}`,
      hostId: socket.id,
      hostName,
      category,
      players: [],
      currentQuestion: 0,
      gameStarted: false,
      questionActive: false,
      timer: null,
      questionStartedAt: null
    };

    socket.join(pin);

    socket.emit("quiz:created", {
      pin,
      roomId: `quiz_${pin}`
    });

    console.log(`Quiz created: ${pin}`);
  });

  socket.on("quiz:join", ({ pin, playerName }) => {

    const room = rooms[pin];

    if (!room) {
      socket.emit("error:message", "Quiz room not found.");
      return;
    }

    if (room.gameStarted) {
      socket.emit("error:message", "Game has already started.");
      return;
    }

    const alreadyJoined = room.players.some(
      (player) => player.name.toLowerCase() === playerName.toLowerCase()
    );

    if (alreadyJoined) {
      socket.emit("error:message", "Player name already exists.");
      return;
    }

    const player = {
      id: socket.id,
      name: playerName,
      score: 0,
      answered: false
    };

    room.players.push(player);

    socket.join(pin);

    socket.emit("quiz:joined", {
      pin,
      playerName
    });

    io.to(pin).emit("lobby:update", {
      players: room.players.map((player) => ({
        name: player.name,
        score: player.score
      }))
    });

    console.log(`${playerName} joined quiz ${pin}`);
  });

  socket.on("quiz:start", ({ pin }) => {

    const room = rooms[pin];

    if (!room) {
      socket.emit("error:message", "Quiz room not found.");
      return;
    }

    if (socket.id !== room.hostId) {
      socket.emit("error:message", "Only the host can start the quiz.");
      return;
    }

    if (room.players.length === 0) {
      socket.emit("error:message", "At least one player is required.");
      return;
    }

    if (room.gameStarted) {
      return;
    }

    room.gameStarted = true;

    io.to(pin).emit("quiz:started");
  });
};