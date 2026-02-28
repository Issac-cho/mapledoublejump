const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());

// HTTP 서버 생성 및 Socket.io 연결
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: [
      "http://rene-descartes.store",
      "http://localhost:5500",
      "http://127.0.0.1:5500"
    ],
    methods: ["GET", "POST"]
  }
});

// 광장에 있는 유저들의 상태를 메모리에 저장할 객체
// 데이터베이스(MariaDB 등)에 매번 저장하면 너무 무거우므로 인메모리(서버 램)에서 관리합니다.
const players = {}; 

io.on('connection', (socket) => {
  console.log(`[입장 대기] 접속된 소켓 ID: ${socket.id}`);

  // 1. 유저가 광장(게임 화면)에 렌더링 준비를 마치고 입장을 요청했을 때
  socket.on('join_plaza', (userData) => {
    console.log(`[광장 입장] ${userData.nickname} 님이 헤네시스에 입장했습니다.`);

    // 초기 플레이어 데이터 셋업 (데이터 다이어트 적용: x, y, state, direction)
    players[socket.id] = {
      id: socket.id,
      nickname: userData.nickname,
      x: userData.x || 100, // 기본 스폰 X 좌표
      y: userData.y || 100, // 기본 스폰 Y 좌표
      s: 'idle',            // 현재 상태 (idle, walk, jump, double_jump)
      d: 'right',           // 바라보는 방향
      avatar: userData.avatar // 코디 정보
    };

    // 나를 제외한 광장의 모든 유저에게 나의 입장 소식을 알림
    socket.broadcast.emit('new_player', players[socket.id]);

    // 나에게는 현재 광장에 있는 기존 유저들의 전체 목록을 보내줌
    socket.emit('current_players', players);
  });

  // 2. 캐릭터 이동 및 더블점프 모션 동기화 (초당 10~15회 수신 예정)
  socket.on('player_move', (moveData) => {
    if (players[socket.id]) {
      // 서버 메모리의 내 위치 정보 업데이트
      players[socket.id].x = moveData.x;
      players[socket.id].y = moveData.y;
      players[socket.id].s = moveData.s;
      players[socket.id].d = moveData.d;

      // 나를 제외한 모든 유저에게 나의 변경된 위치/모션(더블점프 등)을 브로드캐스팅
      // 데이터량을 최소화하기 위해 socket.id와 변경된 좌표만 전송합니다.
      socket.broadcast.emit('player_moved', {
        id: socket.id,
        x: moveData.x,
        y: moveData.y,
        s: moveData.s,
        d: moveData.d
      });
    }
  });

  // 3. 말풍선 텍스트 채팅
  socket.on('chat_message', (msgData) => {
    // 모든 유저(나 포함)에게 메시지를 뿌려서 머리 위에 말풍선을 띄우게 함
    io.emit('chat_updated', {
      id: socket.id,
      nickname: players[socket.id]?.nickname || '알 수 없음',
      message: msgData.message
    });
  });

  // 1. 누군가 상대방에게 통화 초대장(Offer)을 보낼 때
  socket.on('webrtc_offer', (data) => {
    // 받는 사람(target)에게 보낸 사람(caller)의 정보와 초대장을 전달
    socket.to(data.target).emit('webrtc_offer', {
      sdp: data.sdp,
      caller: socket.id
    });
  });

  // 2. 초대장을 받은 사람이 수락장(Answer)을 보낼 때
  socket.on('webrtc_answer', (data) => {
    // 원래 초대장을 보냈던 사람(target)에게 수락장을 전달
    socket.to(data.target).emit('webrtc_answer', {
      sdp: data.sdp,
      callee: socket.id
    });
  });

  // 3. 서로의 네트워크 통신 경로(ICE Candidate)를 교환할 때
  socket.on('webrtc_ice_candidate', (data) => {
    socket.to(data.target).emit('webrtc_ice_candidate', {
      candidate: data.candidate,
      sender: socket.id
    });
  });

  // 1. 유저가 접속을 끊었을 때 (새로고침, 브라우저 종료 등)
  socket.on('disconnect', () => {
    console.log(`[퇴장] 소켓 ID: ${socket.id} 님이 떠났습니다.`);
    delete players[socket.id];
    io.emit('player_leave', socket.id);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 헤네시스 광장 서버가 ${PORT}번 포트에서 가동 중입니다!`);
});