var ipc = require('ipc');
var taigaHost = "https://api.taiga.io";

var app = angular.module('Rye', ['ui.bootstrap', 'ngResource', 'ngRoute']);

app.factory('Auth', ['$resource', function($resource) {
return $resource(taigaHost + '/api/v1/auth/', null,
    {
        'login': { method:'POST'}
    });
}]);

app.controller('LoginController', ['$scope', '$routeParams', 'Auth',
                                   function($scope, $routeParams, Auth) {
    var login = this;
    login.fullName = "";
    login.photo = "";

    login.username = "";
    login.password = "";

    var loginPayload = function() {
        return {
            type: "normal",
            username: login.username,
            password: login.password
        }
    }
    login.login = function() {
        Auth.login(
            loginPayload(),
            function(response) {
                ipc.send('authenticate', response);
            }
        );
    };
    ipc.on('authenticated', function(credential) {
        login.fullName = credential.full_name
        login.photo = "https:" + credential.photo
    });
}]);
