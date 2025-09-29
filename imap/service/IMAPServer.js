const { Socket } = require('dgram');
const net = require('net');
const fs = require('fs');
const path = require('path');

class IMAPServer {

    constructor(host="0.0.0.0", port=143) {
        this.host = host;
        this.port = port;
        this.server = '';
        this.commands = {};
        this.loadCommands();
    }

    loadCommands() {
        const commandsDir = path.join(__dirname, 'commands');
        const commandFiles = fs.readdirSync(commandsDir).filter(file => file.endsWith('.js'));

        for (const file of commandFiles) {
            const commandName = path.basename(file, '.js');
            const CommandClass = require(path.join(commandsDir, file));
            this.commands[commandName.toUpperCase()] = CommandClass;
        }
    }

    start(){
        this.server = net.createServer((socket)=>{
            this.handleIMAPConnection(socket);
        });
        this.server.listen(this.port, this.host, ()=>{
            console.log("IMAP Server Started.....");
        });
    }

    handleIMAPConnection(socket){
        const state = {
            authenticated: false,
            selectedMailbox: null,
            uid: false
        };

        // Send greeting
        socket.write("* OK IMAP4rev1 Server ready\r\n");

        socket.on('data', async (chunkdata)=>{
            const lines = chunkdata.toString().split(/\r?\n/);
            for (let line of lines){
                if(!line) continue;
                await this.handleIMAPCommand(socket, line, state);
            }
        });
        
        socket.on('error', (error) => {
            console.error("Error on SMTP Server:", error.message);
        });

        socket.on('end', () => {
            console.info("Client Disconnected.");
        });
    }

    async handleIMAPCommand(socket, line, state) {
        const parts = line.split(' ');
        if (parts.length < 2) return;

        const tag = parts[0];
        const command = parts[1].toUpperCase();
        const args = parts.slice(2);

        if (this.commands[command]) {
            try {
                await this.commands[command].execute(socket, tag, args, state);
            } catch (error) {
                console.error(`Error executing IMAP command ${command}:`, error);
                socket.write(`${tag} BAD Command failed\r\n`);
            }
        } else {
            socket.write(`${tag} BAD Command not recognized\r\n`);
        }
    }
}

module.exports = IMAPServer;