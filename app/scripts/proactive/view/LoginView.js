define(
    [
        'jquery',
        'backbone',
        'proactive/rest/studio-client'
    ],

    function ($, Backbone, StudioClient) {

        "use strict";

        return Backbone.View.extend({
            initialize: function () {
                this.render();
            },
            login: function () {
                var that = this;
                var form = $('<form><input type="text" id="studio-user" class="span2 nav-login form-control  pull-left" placeholder="user"><input type="password" id="studio-pass" class="span2 nav-login form-control pull-left" placeholder="password"></form>')
                var buttonLogin = $('<button class="btn btn-small menu-button pull-left" data-toggle="dropdown">Login</button>');
                form.append(buttonLogin);

                buttonLogin.click(function () {
                    StudioClient.login({
                        user: $("#studio-user").val(),
                        pass: $("#studio-pass").val()
                    }, function () {
                        // on success
                        form.remove();
                        that.$el.html(that.logout());
                        that.options.projects.sync();

                        var workflowJson = that.options.projects.getCurrentWorkFlowAsJson()
                        if (workflowJson) {
                            var StudioApp = require('StudioApp');
                            StudioApp.import(workflowJson)
                        }
                    })
                })

                return form;
            },
            logout: function () {
                var that = this;
                var buttonLogout = $('<button class="btn btn-small menu-button" data-toggle="dropdown">Logout</button>');
                var menu = $('<form class="navbar-search pull-right menu-form">Logged in as <b>' + localStorage["user"] + '</b></form>');
                menu.append(buttonLogout);

                buttonLogout.click(function () {
                    StudioClient.logout()
                    that.$el.html(that.login());
                })

                return menu;
            },
            render: function () {
                console.log("Render Connected to the studio")
                var that = this;
                var connectionChecktingTimer;

                function isConnected() {
                    StudioClient.isConnected(function () {
                        // logged in successfully - show user name
                        console.log("Logged in");
                        that.$el.html(that.logout());
                        that.options.projects.sync();

                        var workflowJson = that.options.projects.getCurrentWorkFlowAsJson()
                        if (workflowJson) {
                            var StudioApp = require('StudioApp');
                            StudioApp.import(workflowJson)
                        }
                        clearInterval(connectionChecktingTimer)
                        connectionChecktingTimer = setInterval(checkConnected, 1000)

                    }, function () {
                        // failed to login - show login form
                        console.log("Login Required")
                        that.$el.html(that.login());
                        clearInterval(connectionChecktingTimer)
                        connectionChecktingTimer = setInterval(tryToConnect, 1000)
                    })
                }

                function tryToConnect() {
                    if (StudioClient.isLoggedIn()) {
                        isConnected()
                    }
                }

                function checkConnected() {
                    if (!StudioClient.isLoggedIn()) {
                        isConnected()
                    }
                }

                connectionChecktingTimer = setInterval(tryToConnect, 1000)
                isConnected()
                return this;
            }
        })

    }
)