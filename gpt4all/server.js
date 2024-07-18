import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import { createCompletionStream, loadModel } from 'gpt4all';


const localModelPath = 'orca-mini-3b-gguf2-q4_0.gguf';

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

let model;

// Load the GPT4All model from the local path

try {
    model = await loadModel(localModelPath);
    console.log('GPT4All Model Loaded from Local Path');
} catch (err) {
    console.error('Error loading GPT4All model:', err);
}


io.on('connection', (socket) => {
    console.log('New client connected');
    socket.on('chat message', async (msg) => {
        console.log('Message received:', msg);

        if (!model) {
            return socket.emit('chat message part', { user: 'AI', message: 'Model not loaded.' });
        }

        try {
            // Broadcast the user's message
            io.emit('chat message', { user: 'User', message: msg });

            // Create a streaming response
            const responseStream = createCompletionStream( model, msg);
            responseStream.tokens.on("data", (data) => {
                socket.emit('chat message part', { user: 'AI', message: data.toString() });
            });


            // Handle the end of the stream
            socket.emit('chat message end', { user: 'AI' });

        } catch (error) {
            console.error('Error generating response:', error);
            socket.emit('chat message part', { user: 'AI', message: 'Sorry, I encountered an error while processing your request.' });
        }
    });

    socket.on('disconnect', () => {
        console.log('Client disconnected');
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

