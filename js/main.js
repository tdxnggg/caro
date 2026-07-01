import { db, state, BOARD_SIZE, TURN_TIMEOUT, playSound, checkWin5 } from './config.js';
import { ref, set, onValue, update, off, runTransaction } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";
import { makeAIMove } from './bot.js';
import { initChatListener, sendChatMessage } from './chat.js';

let cells = []; // Sẽ được cập nhật động sau khi sinh ô cờ
const statusElement = document.getElementById('status');
const resetBtn = document.getElementById('resetBtn');
const boardElement = document.getElementById('board');

// 🛠️ HÀM TỰ ĐỘNG TẠO LƯỚI 225 Ô CỜ (15x15) KHÔNG BỊ MẤT Ô
function createBoardCells() {
    boardElement.innerHTML = ''; // Xóa sạch các ô cũ để tránh trùng lặp
    for (let i = 0; i < BOARD_SIZE * BOARD_SIZE; i++) {
        const cell = document.createElement('div');
        cell.className = 'cell';
        cell.setAttribute('data-index', i);
        boardElement.appendChild(cell);
    }
    // Cập nhật lại danh sách node cells để đồng bộ hiển thị nước đi
    cells = document.querySelectorAll('.cell');
}

// ⏱️ HÀM BẮT ĐẦU ĐẾM NGƯỢC THỜI GIAN 1 PHÚT
function startTurnTimer() {
    stopTurnTimer(); // Xóa bộ đếm cũ nếu có
    if (!state.isGameActive) return;

    let timeLeft = 60;
    updateTimerStatusDisplay(timeLeft);

    state.turnTimerId = setInterval(() => {
        timeLeft--;
        updateTimerStatusDisplay(timeLeft);

        if (timeLeft <= 0) {
            stopTurnTimer();
            handleTimeoutDefeat(); // Xử lý thua do hết giờ
        }
    }, 1000);
}

function stopTurnTimer() {
    if (state.turnTimerId) {
        clearInterval(state.turnTimerId);
        state.turnTimerId = null;
    }
}

function updateTimerStatusDisplay(seconds) {
    let roleText = state.currentPlayer === state.myRole ? "Bạn" : `Đối thủ (${state.currentPlayer})`;
    if (state.isAIMode && state.currentPlayer === "O") roleText = "Máy (🤖)";
    
    statusElement.innerHTML = `⏱️ Lượt của ${roleText} — Còn lại: <span style="color:#ff7675; font-weight:800;">${seconds}s</span>`;
}

// Xử lý khi có một bên hết thời gian chạy 1 phút
function handleTimeoutDefeat() {
    state.isGameActive = false;
    stopTurnTimer();

    if (state.isAIMode) {
        if (state.currentPlayer === "X") {
            state.scoreO++;
            statusElement.innerHTML = `⏰ Hết giờ! Bạn đã bị xử thua trước Máy!`;
        } else {
            state.scoreX++;
            statusElement.innerHTML = `⏰ Máy hết thời gian suy nghĩ! Bạn thắng ván này!`;
        }
        document.getElementById('scoreX').textContent = state.scoreX;
        document.getElementById('scoreO').textContent = state.scoreO;
        resetBtn.style.display = "inline-block";
    } else {
        // Nếu chơi Online, đồng bộ thông tin xử thua lên Firebase
        let finalWinner = state.currentPlayer === "X" ? "O" : "X";
        let newScoreX = state.scoreX + (finalWinner === "X" ? 1 : 0);
        let newScoreO = state.scoreO + (finalWinner === "O" ? 1 : 0);

        update(ref(db, 'rooms/' + state.roomId), {
            isGameActive: false,
            scoreX: newScoreX,
            scoreO: newScoreO,
            timeoutWinner: finalWinner // Đánh dấu người thắng nhờ đối thủ timeout
        });
    }
}

// Xử lý chuyển đổi tab chọn chế độ
document.getElementById('modePVP').addEventListener('click', () => {
    state.isAIMode = false;
    document.getElementById('modePVP').classList.add('active');
    document.getElementById('modeAI').classList.remove('active');
    document.getElementById('pvpFields').style.display = 'block';
    document.getElementById('aiFields').style.display = 'none';
});

document.getElementById('modeAI').addEventListener('click', () => {
    state.isAIMode = true;
    document.getElementById('modeAI').classList.add('active');
    document.getElementById('modePVP').classList.remove('active');
    document.getElementById('pvpFields').style.display = 'none';
    document.getElementById('aiFields').style.display = 'block';
});

// Nút bắt đầu chơi kích hoạt sảnh đợi
document.getElementById('joinGameBtn').addEventListener('click', () => {
    state.myName = document.getElementById('usernameInput').value.trim();
    if (!state.myName) { alert("Vui lòng nhập tên!"); return; }
    
    // Kích hoạt sinh lưới ô cờ tự động ngay khi vào trận
    createBoardCells();

    if (state.isAIMode) {
        state.aiLevel = document.getElementById('aiLevelSelect').value;
        state.roomId = "bot_" + Math.floor(10000 + Math.random() * 90000);
        state.myRole = "X";
        state.lastWinner = null; // Reset người thắng trước đó cho phiên chơi AI mới
        document.getElementById('roomIdLabel').textContent = "ĐẤU VỚI MÁY";
        document.getElementById('copyLinkBtn').style.display = 'none';
        
        document.getElementById('lobbyScreen').style.display = 'none';
        document.getElementById('leaderboardScreen').style.display = 'none';
        document.getElementById('gameScreen').style.display = 'flex';
        
        initLocalAIGame();
    } else {
        let targetRoom = document.getElementById('roomInput').value.trim();
        if (!targetRoom) targetRoom = Math.floor(10000 + Math.random() * 90000).toString();
        state.roomId = targetRoom;
        window.history.replaceState(null, null, `?room=${state.roomId}`);
        document.getElementById('roomIdLabel').textContent = state.roomId;
        document.getElementById('copyLinkBtn').style.display = 'inline-block';
        
        document.getElementById('lobbyScreen').style.display = 'none';
        document.getElementById('leaderboardScreen').style.display = 'none';
        document.getElementById('gameScreen').style.display = 'flex';
        
        initRoomListener();
        initChatListener(state.roomId);
    }
});

// 🤖 KHỞI TẠO ĐẤU VỚI MÁY
function initLocalAIGame() {
    state.boardState = Array(BOARD_SIZE * BOARD_SIZE).fill("");
    state.isGameActive = true;
    state.isPointUpdatedForThisMatch = false;

    // 🎯 TÍNH NĂNG 2: KIỂM TRA ĐI TRƯỚC CHO TRẬN BOT
    if (state.lastWinner === "X") {
        state.currentPlayer = "X";
    } else if (state.lastWinner === "O") {
        state.currentPlayer = "O";
    } else {
        state.currentPlayer = Math.random() < 0.5 ? "X" : "O"; // Chưa có ai thắng -> Random ngẫu nhiên
    }
    
    document.getElementById('nameX').textContent = state.myName;
    document.getElementById('nameO').textContent = `Máy (🤖 ${state.aiLevel.toUpperCase()})`;
    document.getElementById('scoreX').textContent = state.scoreX;
    document.getElementById('scoreO').textContent = state.scoreO;
    
    document.getElementById('chatMessages').innerHTML = "<div class='chat-msg'><b>Hệ thống:</b> Bạn đang chơi với Máy.</div>";
    
    renderLocalBoard();
    startTurnTimer();
    
    if (state.currentPlayer === "O") {
        setTimeout(executeBotTurn, 600);
    }
}

function renderLocalBoard() {
    if (cells.length === 0) return;
    cells.forEach((cell, index) => {
        cell.textContent = state.boardState[index];
        cell.className = "cell " + state.boardState[index];
    });
}

function executeBotTurn() {
    if (!state.isGameActive) return;
    let botIndex = makeAIMove(state.boardState, state.aiLevel);
    if (botIndex !== -1) {
        state.boardState[botIndex] = "O";
        playSound('drop');
        renderLocalBoard();

        if (checkWin5(Math.floor(botIndex / BOARD_SIZE), botIndex % BOARD_SIZE, "O", state.boardState)) {
            state.isGameActive = false;
            stopTurnTimer();
            state.scoreO++;
            state.lastWinner = "O"; // Lưu trạng thái Máy thắng
            document.getElementById('scoreO').textContent = state.scoreO;
            statusElement.innerHTML = `😢 Máy (🤖) đã giành chiến thắng!`;
            resetBtn.style.display = "inline-block";
        } else if (!state.boardState.includes("")) {
            state.isGameActive = false;
            stopTurnTimer();
            statusElement.innerHTML = `🤝 Trận đấu Hòa!`;
            resetBtn.style.display = "inline-block";
        } else {
            state.currentPlayer = "X";
            startTurnTimer();
        }
    }
}

function handleLocalCellClick(index) {
    if (!state.isGameActive || state.boardState[index] !== "" || state.currentPlayer !== "X") return;
    
    state.boardState[index] = "X";
    playSound('drop');
    renderLocalBoard();

    if (checkWin5(Math.floor(index / BOARD_SIZE), index % BOARD_SIZE, "X", state.boardState)) {
        state.isGameActive = false;
        stopTurnTimer();
        state.scoreX++;
        state.lastWinner = "X"; // Người thắng lưu vào hệ thống để ván sau đi trước
        document.getElementById('scoreX').textContent = state.scoreX;
        statusElement.innerHTML = `🎉 Chúc mừng bạn đã thắng Máy!`;
        playSound('win');
        resetBtn.style.display = "inline-block";
        incrementUserWinCount(state.myName);
    } else if (!state.boardState.includes("")) {
        state.isGameActive = false;
        stopTurnTimer();
        statusElement.innerHTML = `🤝 Trận đấu Hòa!`;
        resetBtn.style.display = "inline-block";
    } else {
        state.currentPlayer = "O";
        startTurnTimer();
        setTimeout(executeBotTurn, 800);
    }
}

// 🌐 KHỞI TẠO TRẬN ĐẤU ONLINE (FIREBASE)
function initRoomListener() {
    const roomListenerRef = ref(db, 'rooms/' + state.roomId);
    onValue(roomListenerRef, (snapshot) => {
        const data = snapshot.val();
        if (!data) {
            state.myRole = "X";
            // Ván đấu mới đầu tiên chưa từng chơi phòng này -> RANDOM người đi trước
            let initialStarter = Math.random() < 0.5 ? "X" : "O";
            set(roomListenerRef, {
                board: Array(BOARD_SIZE * BOARD_SIZE).fill(""),
                currentPlayer: initialStarter, 
                isGameActive: true,
                hasX: true, hasO: false,
                nameX: state.myName, nameO: "Chờ...", scoreX: 0, scoreO: 0,
                lastWinner: "none"
            });
            return;
        }

        if (state.myRole === "") {
            if (data.hasX && !data.hasO) { state.myRole = "O"; update(roomListenerRef, { hasO: true, nameO: state.myName }); } 
            else if (!data.hasX) { state.myRole = "X"; update(roomListenerRef, { hasX: true, nameX: state.myName }); } 
            else { state.myRole = "Viewer"; }
        }

        state.boardState = data.board;
        state.currentPlayer = data.currentPlayer;
        state.scoreX = data.scoreX || 0;
        state.scoreO = data.scoreO || 0;
        state.isGameActive = data.isGameActive;
        state.lastWinner = data.lastWinner || "none";

        document.getElementById('nameX').textContent = data.nameX || "Chờ...";
        document.getElementById('nameO').textContent = data.nameO || "Chờ...";
        document.getElementById('scoreX').textContent = state.scoreX;
        document.getElementById('scoreO').textContent = state.scoreO;

        let currentBoardString = state.boardState.join("");
        if (state.lastBoardString !== "" && currentBoardString !== state.lastBoardString) { playSound('drop'); }
        state.lastBoardString = currentBoardString;

        if (cells.length > 0) {
            cells.forEach((cell, index) => {
                cell.textContent = state.boardState[index];
                cell.className = "cell " + state.boardState[index];
            });
        }

        if (!state.isGameActive) {
            stopTurnTimer();
            if (data.timeoutWinner) {
                let winnerName = data.timeoutWinner === "X" ? data.nameX : data.nameO;
                statusElement.innerHTML = `⏰ Hết giờ! 🎉 <span class="player-${data.timeoutWinner.toLowerCase()}">${winnerName}</span> thắng cuộc!`;
            } else {
                let gameWon = checkWinOnBoard();
                if (gameWon) {
                    let winner = state.currentPlayer === "X" ? "O" : "X";
                    let winnerName = winner === "X" ? data.nameX : data.nameO;
                    statusElement.innerHTML = `🎉 <span class="player-${winner.toLowerCase()}">${winnerName}</span> thắng cuộc!`;
                } else { statusElement.innerHTML = `🤝 Trận đấu kết quả Hòa!`; }
            }
            resetBtn.style.display = "inline-block";
            return;
        }

        resetBtn.style.display = "none";
        startTurnTimer(); // Reset và chạy đồng hồ 1 phút cho người chơi hiện tại
    });

    boardElement.addEventListener('click', (e) => {
        const clickedCell = e.target;
        if (!clickedCell.classList.contains('cell')) return;
        const index = parseInt(clickedCell.getAttribute('data-index'));

        if (state.isAIMode) {
            handleLocalCellClick(index);
            return;
        }

        if (!state.isGameActive || state.myRole === "Viewer" || state.boardState[index] !== "" || state.currentPlayer !== state.myRole) return;

        state.boardState[index] = state.myRole;
        let nextPlayer = state.myRole === "X" ? "O" : "X";
        let gameWon = checkWin5(Math.floor(index / BOARD_SIZE), index % BOARD_SIZE, state.myRole, state.boardState);
        let gameDraw = !state.boardState.includes("") && !gameWon;
        let activeState = true;
        let newScoreX = state.scoreX, newScoreO = state.scoreO;
        let currentWinner = "none";

        if (gameWon || gameDraw) {
            activeState = false;
            if (gameWon) {
                currentWinner = state.myRole; // Cập nhật ai là người thắng ván này lên DB
                if (state.myRole === "X") newScoreX += 1;
                if (state.myRole === "O") newScoreO += 1;
                incrementUserWinCount(state.myName);
            }
        }

        update(ref(db, 'rooms/' + state.roomId), {
            board: state.boardState, 
            currentPlayer: nextPlayer,
            isGameActive: activeState, 
            scoreX: newScoreX, 
            scoreO: newScoreO,
            lastWinner: currentWinner
        });
    });
}

function checkWinOnBoard() {
    for (let r = 0; r < BOARD_SIZE; r++) {
        for (let c = 0; c < BOARD_SIZE; c++) {
            let p = state.boardState[r * BOARD_SIZE + c];
            if (p !== "" && checkWin5(r, c, p, state.boardState)) return true;
        }
    }
    return false;
}

// Lắng nghe nút chơi trận mới
resetBtn.addEventListener('click', () => {
    playSound('click');
    if (state.isAIMode) {
        initLocalAIGame();
        resetBtn.style.display = "none";
    } else {
        // 🎯 TÍNH NĂNG 2 ONLINE: Chọn tiếp trận thì ai thắng ván trước (lastWinner) sẽ được ưu tiên đi trước
        let nextStarter = "X"; 
        if (state.lastWinner === "X" || state.lastWinner === "O") {
            nextStarter = state.lastWinner;
        } else {
            nextStarter = Math.random() < 0.5 ? "X" : "O";
        }

        update(ref(db, 'rooms/' + state.roomId), {
            board: Array(BOARD_SIZE * BOARD_SIZE).fill(""),
            currentPlayer: nextStarter, 
            isGameActive: true,
            timeoutWinner: null
        });
    }
});

// Nút Gửi Chat Tự do
document.getElementById('chatSendBtn').addEventListener('click', () => {
    const input = document.getElementById('chatInput');
    sendChatMessage(input.value);
    input.value = "";
});
document.getElementById('chatInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        const input = document.getElementById('chatInput');
        sendChatMessage(input.value);
        input.value = "";
    }
});
document.querySelectorAll('.quick-btn').forEach(button => {
    button.addEventListener('click', () => {
        playSound('click');
        sendChatMessage(button.getAttribute('data-msg'));
    });
});

// BXH Lấy từ hệ thống
onValue(ref(db, 'users'), (snapshot) => {
    const usersData = snapshot.val();
    const leaderboardList = document.getElementById('leaderboardList');
    leaderboardList.innerHTML = "";
    if (!usersData) { leaderboardList.innerHTML = "<li>Chưa có dữ liệu.</li>"; return; }
    let sortedPlayers = [];
    for (let name in usersData) { sortedPlayers.push({ name: name, score: usersData[name].winCount || 0 }); }
    sortedPlayers.sort((a, b) => b.score - a.score);
    sortedPlayers.slice(0, 5).forEach((player, index) => {
        let li = document.createElement('li');
        li.className = "leaderboard-item";
        li.innerHTML = `${index + 1}. ${player.name} <span>${player.score} Trận Thắng</span>`;
        leaderboardList.appendChild(li);
    });
});

function incrementUserWinCount(username) {
    if (!username || username === "Chờ..." || username.includes("Máy")) return;
    runTransaction(ref(db, `users/${username}/winCount`), (count) => (count || 0) + 1);
}

document.getElementById('copyLinkBtn').addEventListener('click', () => {
    navigator.clipboard.writeText(window.location.href);
    alert("Đã copy link phòng mời bạn!");
});

document.getElementById('leaveBtn').addEventListener('click', () => {
    stopTurnTimer();
    if (!state.isAIMode && state.roomId) {
        if (state.myRole === "X") { update(ref(db, 'rooms/' + state.roomId), { hasX: false, nameX: "Chờ..." }); } 
        else if (state.myRole === "O") { update(ref(db, 'rooms/' + state.roomId), { hasO: false, nameO: "Chờ..." }); }
        off(ref(db, 'rooms/' + state.roomId));
        off(ref(db, 'chats/' + state.roomId));
    }
    state.myRole = ""; state.lastBoardString = ""; state.scoreX = 0; state.scoreO = 0; state.lastWinner = null;
    window.history.replaceState(null, null, window.location.pathname);
    document.getElementById('gameScreen').style.display = 'none';
    document.getElementById('lobbyScreen').style.display = 'block';
    document.getElementById('leaderboardScreen').style.display = 'block';
});