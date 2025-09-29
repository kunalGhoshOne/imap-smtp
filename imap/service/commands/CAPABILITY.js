class CAPABILITY {
    static async execute(socket, tag) {
        const capabilities = [
            'IMAP4rev1',
            'LITERAL+',
            'SASL-IR',
            'LOGIN-REFERRALS',
            'ID',
            'ENABLE',
            'IDLE',
            'STARTTLS',
            'AUTH=PLAIN',
            'AUTH=LOGIN'
        ];

        socket.write(`* CAPABILITY ${capabilities.join(' ')}\r\n`);
        socket.write(`${tag} OK CAPABILITY completed\r\n`);
    }
}

module.exports = CAPABILITY;