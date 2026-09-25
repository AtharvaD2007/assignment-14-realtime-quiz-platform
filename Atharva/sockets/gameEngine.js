const questions = require("../data/questions.json");

const TIME_LIMIT = 15000;

function calculateScore(isCorrect, timeTakenMs) {

  if (!isCorrect) {
    return 0;
  }

  const timeRemaining = Math.max(
    0,
    TIME_LIMIT - timeTakenMs
  );

  const speedBonus = Math.round(
    (timeRemaining / TIME_LIMIT) * 500
  );

  const baseScore = 500;

  return baseScore + speedBonus;
}

function getLeaderboard(players) {

  const sortedPlayers = [...players].sort(
    (a, b) => b.score - a.score
  );

  return sortedPlayers.map((player, index) => ({
    rank: index + 1,
    name: player.name,
    score: player.score
  }));
}

module.exports = function gameEngine(io, socket, rooms) {

  function startQuestion(pin) {

    const room = rooms[pin];

    if (!room) {
      return;
    }

    if (room.currentQuestion >= questions.length) {

      const leaderboard = getLeaderboard(room.players);

      const winner = leaderboard[0];

      io.to(pin).emit("quiz:ended", {
        winner,
        finalRanks: leaderboard
      });

      room.gameStarted = false;
      room.questionActive = false;

      return;
    }

    const question = questions[room.currentQuestion];

    room.questionActive = true;
    room.questionStartedAt = Date.now();

    room.players.forEach((player) => {
      player.answered = false;
    });

    io.to(pin).emit("question:start", {
      questionIndex: room.currentQuestion + 1,
      totalQuestions: questions.length,
      question: question.question,
      options: question.options,
      timeLimitSeconds: 15
    });

    room.timer = setTimeout(() => {
      endQuestion(pin);
    }, TIME_LIMIT);
  }

  function endQuestion(pin) {

    const room = rooms[pin];

    if (!room || !room.questionActive) {
      return;
    }

    const question = questions[room.currentQuestion];

    room.questionActive = false;

    io.to(pin).emit("question:time_up", {
      correctOption: question.correctOption,
      explanation: question.explanation
    });

    const leaderboard = getLeaderboard(room.players);

    io.to(pin).emit("leaderboard:update", {
      leaderboard
    });

    room.currentQuestion++;

    setTimeout(() => {
      if (rooms[pin]) {
        startQuestion(pin);
      }
    }, 3000);
  }

  socket.on("quiz:started", ({ pin }) => {

    const room = rooms[pin];

    if (!room) {
      return;
    }

    if (socket.id !== room.hostId) {
      return;
    }

    startQuestion(pin);
  });

  socket.on("answer:submit", ({
    pin,
    selectedOption,
    timeTakenMs
  }) => {

    const room = rooms[pin];

    if (!room) {
      socket.emit("error:message", "Quiz room not found.");
      return;
    }

    if (!room.questionActive) {
      socket.emit(
        "error:message",
        "Time is up. Answer rejected."
      );
      return;
    }

    const player = room.players.find(
      (p) => p.id === socket.id
    );

    if (!player) {
      socket.emit(
        "error:message",
        "You are not a player in this quiz."
      );
      return;
    }

    if (player.answered) {
      socket.emit(
        "error:message",
        "You have already answered."
      );
      return;
    }

    const serverTimeTaken =
      Date.now() - room.questionStartedAt;

    if (serverTimeTaken > TIME_LIMIT) {
      socket.emit(
        "error:message",
        "Answer submitted after timer expiry."
      );
      return;
    }

    const question = questions[room.currentQuestion];

    const isCorrect =
      Number(selectedOption) === question.correctOption;

    const score = calculateScore(
      isCorrect,
      serverTimeTaken
    );

    player.score += score;
    player.answered = true;

    socket.emit("answer:result", {
      correct: isCorrect,
      score,
      totalScore: player.score
    });

    const allAnswered = room.players.every(
      (p) => p.answered
    );

    if (allAnswered) {

      clearTimeout(room.timer);

      endQuestion(pin);
    }
  });

};