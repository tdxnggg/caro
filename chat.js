import { db, state } from './config.js';
import { ref, set, push, onValue } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";

let currentChatRef = null;

export function initChatListener(roomId) {
    currentChatRef = ref(db, 'chats/' + roomId);
    const messagesDiv = document.getElementById('chatMessages');
    messagesDiv.innerHTML = "";

    onValue(currentChatRef, (snapshot) => {
        messagesDiv.innerHTML = "";
        const chatData = snapshot.val();
        if (!chatData) return;

        for (let key in chatData) {
            let msg = chatData[key];
            let div = document.createElement('div');
            div.className = `chat-msg ${msg.sender === state.myName ? 'me' : ''}`;
            div.innerHTML = `<span class="msg-user">${msg.sender}</span>${msg.text}`;
            messagesDiv.appendChild(div);
        }
        messagesDiv.scrollTop = messagesDiv.scrollHeight;
    });
}

export function sendChatMessage(text) {
    if (state.isAIMode || !currentChatRef || !text.trim()) return;
    const newChatRef = push(currentChatRef);
    set(newChatRef, {
        sender: state.myName,
        text: text.trim(),
        timestamp: Date.now()
    });
}