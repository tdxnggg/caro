import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getDatabase } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";

export const firebaseConfig = {
    apiKey: "AIzaSyDkD2MbqQg5ZbdpIEjPBWDCO9Eq-A9Dgvk",
    authDomain: "caro-1212.firebaseapp.com",
    databaseURL: "https://caro-1212-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "caro-1212",
    storageBucket: "caro-1212.firebasestorage.app",
    messagingSenderId: "1042014143128",
    appId: "1:1042014143128:web:ad64becb1013893f4ac6ed",
    measurementId: "G-9H4WKZ4P2L"
};

export const app = initializeApp(firebaseConfig);
export const db = getDatabase(app);

export const BOARD_SIZE = 15;
export const TURN_TIMEOUT = 60000; // 1 phút = 60000ms

export const state = {
    roomId: null,
    myRole: "",
    myName: "",
    isAIMode: false,
    aiLevel: "medium",
    boardState: Array(BOARD_SIZE * BOARD_SIZE).fill(""),
    currentPlayer: "X",
    isGameActive: true,
    lastBoardString: "",
    scoreX: 0,
    scoreO: 0,
    isPointUpdatedForThisMatch: false,
    lastWinner: null, // Lưu "X" hoặc "O" để tính toán ai đi trước ở ván tiếp theo
    turnTimerId: null  // Bộ đếm đếm ngược thời gian
};

// 🔊 Hàm phát âm thanh hệ thống (Đã sửa lỗi Auto-play bị trình duyệt chặn)
export function playSound(type) {
    // Khởi tạo AudioContext động khi có tương tác để vượt qua chính sách bảo mật của trình duyệt
    if (!window.globalAudioCtx) {
        window.globalAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    
    // Nếu trạng thái đang bị tạm dừng (suspended), kích hoạt hoạt động lại
    if (window.globalAudioCtx.state === 'suspended') {
        window.globalAudioCtx.resume();
    }

    const osc = window.globalAudioCtx.createOscillator();
    const gain = window.globalAudioCtx.createGain();
    osc.connect(gain); 
    gain.connect(window.globalAudioCtx.destination);
    const now = window.globalAudioCtx.currentTime;

    if (type === 'click') {
        osc.type = 'sine'; 
        osc.frequency.setValueAtTime(587.33, now); 
        osc.frequency.exponentialRampToValueAtTime(880, now + 0.1);
        gain.gain.setValueAtTime(0.15, now); 
        gain.gain.linearRampToValueAtTime(0, now + 0.1);
        osc.start(now); 
        osc.stop(now + 0.1);
    } else if (type === 'drop') {
        osc.type = 'triangle'; 
        osc.frequency.setValueAtTime(300, now);
        osc.frequency.exponentialRampToValueAtTime(600, now + 0.12);
        gain.gain.setValueAtTime(0.3, now); 
        gain.gain.linearRampToValueAtTime(0, now + 0.12);
        osc.start(now); 
        osc.stop(now + 0.12);
    } else if (type === 'win') {
        osc.type = 'sine'; 
        osc.frequency.setValueAtTime(523.25, now); 
        osc.frequency.setValueAtTime(659.25, now + 0.1); 
        osc.frequency.setValueAtTime(783.99, now + 0.2); 
        osc.frequency.setValueAtTime(1046.50, now + 0.3); 
        gain.gain.setValueAtTime(0.2, now);
        gain.gain.linearRampToValueAtTime(0, now + 0.5); 
        osc.start(now); 
        osc.stop(now + 0.5);
    }
}

// Logic kiểm tra thắng chuỗi 5 ô liên tục
export function checkWin5(row, col, player, currentBoard) {
    const directions = [[[0, 1], [0, -1]], [[1, 0], [-1, 0]], [[1, 1], [-1, -1]], [[1, -1], [-1, 1]]];
    for (let i = 0; i < directions.length; i++) {
        let count = 1;
        for (let j = 0; j < 2; j++) {
            let dRow = directions[i][j][0], dCol = directions[i][j][1];
            let r = row + dRow, c = col + dCol;
            while (r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE && currentBoard[r * BOARD_SIZE + c] === player) {
                count++; 
                r += dRow; 
                c += dCol;
            }
        }
        if (count >= 5) return true; 
    }
    return false;
}