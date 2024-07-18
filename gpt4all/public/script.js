const socket = io();
const chatForm = document.getElementById('chat-form');
const chatInput = document.getElementById('chat-input');
const chatMessages = document.getElementById('chat-messages');
let aiMessageElement; // Keep track of the current AI message element

chatForm.addEventListener('submit', (e) => {
    e.preventDefault();
    if (chatInput.value) {
        appendMessage('User', chatInput.value); // Append user message immediately
        socket.emit('chat message', chatInput.value);
        chatInput.value = ''; // Clear the input
    }
});

socket.on('chat message part', (data) => {
    appendMessagePart(data.user, data.message);
    chatMessages.scrollTop = chatMessages.scrollHeight;
});

socket.on('chat message end', () => {
    aiMessageElement = null; // Reset the AI message element tracker after the response is complete
    chatMessages.scrollTop = chatMessages.scrollHeight;
});

// Function to append a full message
function appendMessage(user, message) {
    const messageElement = document.createElement('div');
    messageElement.classList.add('message');
    messageElement.innerHTML = `<span class="${user.toLowerCase()}">${user}:</span> ${formatMessage(message)}`;
    chatMessages.appendChild(messageElement);
    if (user === 'AI') {
        aiMessageElement = null; // Reset the AI message element tracker
    }
}

// Function to append a part of an AI message
function appendMessagePart(user, message) {
    if (user === 'AI') {
        if (!aiMessageElement) {
            aiMessageElement = document.createElement('div');
            aiMessageElement.classList.add('message', user.toLowerCase());
            aiMessageElement.innerHTML = `<span class="${user.toLowerCase()}">${user}:</span> <span id="part-message"></span>`;
            chatMessages.appendChild(aiMessageElement);
        }

        // Append the new part to the existing AI message element
        const partMessageElement = aiMessageElement.querySelector('#part-message');
        partMessageElement.innerHTML += formatMessage(message);
    }
}

// Function to format message with preformatted code blocks and handle new lines
function formatMessage(message) {
    const codeRegex = /```([^`]*)```/g;
    // Replace code blocks first
    let formattedMessage = message.replace(codeRegex, (match, p1) => `<pre><code>${p1.trim()}</code></pre>`);
    // Escape HTML special characters
    formattedMessage = formattedMessage.replace(/[&<>"']/g, function (c) {
        return {
            '&': '&',
            '<': '<',
            '>': '>',
            '"': '"',
            '\'':'\''
        }[c];
    });
    // Replace new lines with <br> tags
    formattedMessage = formattedMessage.replace(/\n/g, '<br>');
    return formattedMessage;
}

