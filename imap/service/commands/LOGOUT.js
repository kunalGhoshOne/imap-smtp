class LOGOUT {
    static async execute(socket, tag) {
        socket.write('* BYE IMAP4rev1 Server logging out\r\n');
        socket.write(`${tag} OK LOGOUT completed\r\n`);
        socket.end();
    }
}

module.exports = LOGOUT;