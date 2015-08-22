var ipc = require('ipc');

angular.module('WorksnapsKiller', [])
.controller('LoginController', function() {
    var login = this;
    login.response = "unauthorized";

    login.login = function() {
        ipc.send('asynchronous-message', 'login');
    };
    ipc.on('asynchronous-reply', function(arg) {
        login.response = arg;
    });
});
