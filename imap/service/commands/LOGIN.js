const userStore = require('../../models/UserStore');

class LOGIN {
    static async execute(socket, tag, args, state) {
        if (args.length < 2) {
            socket.write(`${tag} BAD LOGIN requires username and password\r\n`);
            return;
        }

        if (state.authenticated) {
            socket.write(`${tag} BAD Already authenticated\r\n`);
            return;
        }

        const username = args[0].replace(/"/g, ''); // Remove quotes if present
        const password = args[1].replace(/"/g, ''); // Remove quotes if present

        const user = userStore.authenticate(username, password);

        if (user) {
            state.authenticated = true;
            state.user = user;
            state.username = username;

            console.log(`User ${username} authenticated successfully`);
            socket.write(`${tag} OK LOGIN completed\r\n`);
        } else {
            console.log(`Failed login attempt for ${username}`);
            socket.write(`${tag} NO LOGIN failed\r\n`);
        }
    }
}

module.exports = LOGIN;