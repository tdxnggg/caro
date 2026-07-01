import { BOARD_SIZE, checkWin5 } from './config.js';

export function makeAIMove(boardState, aiLevel) {
    let bestMove = -1;

    if (aiLevel === "easy") {
        let empties = [];
        boardState.forEach((val, idx) => { if (val === "") empties.push(idx); });
        bestMove = empties[Math.floor(Math.random() * empties.length)];
    } 
    else if (aiLevel === "medium") {
        bestMove = findWinningOrBlockingMove(boardState);
        if (bestMove === -1) {
            let empties = [];
            boardState.forEach((val, idx) => { if (val === "") empties.push(idx); });
            bestMove = empties[Math.floor(Math.random() * empties.length)];
        }
    } 
    else if (aiLevel === "hard") {
        bestMove = getAdvancedAIMove(boardState);
    }

    return bestMove;
}

function findWinningOrBlockingMove(boardState) {
    for(let i=0; i<boardState.length; i++) {
        if(boardState[i] === "") {
            boardState[i] = "O";
            if(checkWin5(Math.floor(i/BOARD_SIZE), i%BOARD_SIZE, "O", boardState)) { boardState[i] = ""; return i; }
            boardState[i] = "";
        }
    }
    for(let i=0; i<boardState.length; i++) {
        if(boardState[i] === "") {
            boardState[i] = "X";
            if(checkWin5(Math.floor(i/BOARD_SIZE), i%BOARD_SIZE, "X", boardState)) { boardState[i] = ""; return i; }
            boardState[i] = "";
        }
    }
    return -1;
}

function getAdvancedAIMove(boardState) {
    let maxScore = -1;
    let bestIndices = [];
    
    if (!boardState.some(x => x !== "")) return Math.floor((BOARD_SIZE * BOARD_SIZE) / 2);

    for (let i = 0; i < boardState.length; i++) {
        if (boardState[i] !== "") continue;
        
        let row = Math.floor(i / BOARD_SIZE);
        let col = i % BOARD_SIZE;
        
        let attackScore = evaluateCellScore(row, col, "O", boardState);
        let defenseScore = evaluateCellScore(row, col, "X", boardState);
        
        let totalScore = attackScore + defenseScore * 1.2;

        if (totalScore > maxScore) {
            maxScore = totalScore;
            bestIndices = [i];
        } else if (totalScore === maxScore) {
            bestIndices.push(i);
        }
    }
    return bestIndices[Math.floor(Math.random() * bestIndices.length)];
}

function evaluateCellScore(row, col, player, boardState) {
    const directions = [[0,1], [1,0], [1,1], [1,-1]];
    let totalScore = 0;

    directions.forEach(([dRow, dCol]) => {
        let count = 0;
        let openEnds = 0;

        let r = row + dRow, c = col + dCol;
        while (r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE && boardState[r * BOARD_SIZE + c] === player) {
            count++; r += dRow; c += dCol;
        }
        if (r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE && boardState[r * BOARD_SIZE + c] === "") openEnds++;

        r = row - dRow; c = col - dCol;
        while (r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE && boardState[r * BOARD_SIZE + c] === player) {
            count++; r -= dRow; c -= dCol;
        }
        if (r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE && boardState[r * BOARD_SIZE + c] === "") openEnds++;

        if (count >= 4) totalScore += 100000;
        else if (count === 3) totalScore += openEnds === 2 ? 5000 : 800;
        else if (count === 2) totalScore += openEnds === 2 ? 600 : 150;
        else if (count === 1) totalScore += openEnds === 2 ? 100 : 20;
    });
    return totalScore;
}