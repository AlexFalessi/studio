define(
    [
        'dagre',
        'proactive/model/Job',
        'proactive/view/ViewWithProperties',
        'proactive/view/TaskView',
        'proactive/view/utils/undo',
        'proactive/view/dom',
        'xml2json',
        'pnotify'
    ],

    function (d, Job, ViewWithProperties, TaskView, undoManager, dom, xml2json) {

    "use strict";

    return ViewWithProperties.extend({
        zoomArea: $("<div></div>"),
        taskViews: [],
        initialize: function () {
            this.constructor.__super__.initialize.apply(this);
            var that = this;

            this.$el.droppable({
                accept: ".job-element",
                drop: function (event, ui) {
                    undoManager.runWithDisabled(function () {
                        var elem = $(ui.draggable);

                        if (elem.hasClass('task-menu')) {
                            that.createTask(ui)
                        } else {
                            console.log("Creating", elem.data("templateName"), elem.data("templateUrl"));
                            $.ajax({
                                type: "GET",
                                dataType:"text",
                                url: elem.data("templateUrl"),
                                success: function (data) {
                                    //console.log(data)
                                    var json = xml2json.xmlToJson(xml2json.parseXml(data))
                                    //console.log(json)
                                    var StudioApp = require('StudioApp');

                                    StudioApp.merge(json, ui)
                                },
                                error: function (data) {
                                    console.log("Cannot retrieve the template", data)
                                    that.alert("Cannot retrieve the template", "Name: " + elem.data("templateName") + ", url: " + elem.data("templateUrl"), 'error');
                                }
                            });
                        }
                    });
                }
            });

            this.$el.dblclick(function (event) {
                that.clearTextSelection();

                console.log("Creating task", event);
                that.createTask({offset: {top: event.clientY, left: event.clientX}});
            })

            this.initJsPlumb();
            this.$el.html(this.zoomArea);
            this.model.on("change:Job Name", this.updateJobName, this);
        },
        initJsPlumb: function () {
            var that = this;

            function duplicateConnections(connection) {
                return _.filter(jsPlumb.getAllConnections(), function (c) {
                    return connection.target == c.target &&
                        connection.source == c.source &&
                        connection.scope == c.scope &&
                        connection.id != c.id;
                });
            }

            function detachDuplicateConnections(connection) {
                var duplicates = duplicateConnections(connection);
                if (duplicates.length > 0) {
                    _.each(duplicates, function (connection) {
                        jsPlumb.detach(connection, {fireEvent: false})
                    });
                    removeUnconnectedTargetEndpoints();
                    return true;
                } else {
                    return false;
                }
            }

            function removeUnconnectedTargetEndpoints() {
                jsPlumb.selectEndpoints().each(function (ep) {
                    if (ep.connections.length == 0 && !ep.isSource) {
                        jsPlumb.deleteEndpoint(ep)
                    }
                })
            }

            jsPlumb.unbind();

            jsPlumb.bind("connection", function (connection) {
                if (detachDuplicateConnections(connection.connection)) {
                    return;
                }
                connection.sourceEndpoint.addClass("connected")
                connection.targetEndpoint.addClass("connected")
                var source = connection.source;
                var target = connection.target;
                if ($(target).data("view")) {
                    var targetModel = $(target).data("view").model;
                    var sourceModel = $(source).data("view").model;
                    if (connection.connection.scope == 'dependency') {
                        targetModel.addDependency(sourceModel);
                    } else {
                        sourceModel.setControlFlow(connection.connection.scope, targetModel);
                    }
                }
            });

            jsPlumb.bind('connectionDetached', function (connection) {
                if (connection.connection.scope != 'dependency') {
                    connection.sourceEndpoint.removeClass("connected")
                }
                connection.targetEndpoint.removeClass("connected")

                var source = connection.source;
                var target = connection.target;

                if ($(target).data("view")) {
                    var sourceModel = $(source).data("view").model;
                    var targetModel = $(target).data("view").model;
                    if (connection.connection.scope == 'dependency') {
                        targetModel.removeDependency(sourceModel);
                    } else {
                        if (!$(target).data("view").removing) {
                            jsPlumb.deleteEndpoint(connection.targetEndpoint);
                        }
                        sourceModel.removeControlFlow(connection.connection.scope, targetModel);
                    }
                }
            });

            // showing target endpoints
            jsPlumb.bind('connectionDrag', function (connection) {
                $('.task').each(function (i, task) {
                    if ($(task).attr('id') != connection.sourceId) {
                        $(task).data('view').addTargetEndPoint(connection.scope);
                    }
                })
                jsPlumb.repaintEverything()
            });

            jsPlumb.bind('connectionDragStop', function (connection) {
                removeUnconnectedTargetEndpoints()

                if (!connection.target) {
                    // creating a task where drag stopped
                    var sourcePoints = jsPlumb.getEndpoints($("#" + connection.sourceId));
                    for (var i in sourcePoints) {
                        if (sourcePoints[i].scope == connection.scope) {
                            var sourceView = $("#" + connection.sourceId).data('view')
                            var newTask = that.createTask({offset: {top: that.mouseup.top, left: that.mouseup.left}});
                            var endpointDep = newTask.addTargetEndPoint(connection.scope)
                            jsPlumb.connect({source: sourcePoints[i], target: endpointDep, overlays: sourceView.overlays()});

                            break;
                        }
                    }

                }
            });

            this.$el.mouseup(function (event) {
                that.mouseup = {top: event.clientY, left: event.clientX};
            })


            jsPlumb.bind("click", function (connection, originalEvent) {
                if (originalEvent.isPropagationStopped()) return false;
                var source = connection.source;
                var target = connection.target;

                console.log("click on the ", connection)
                jsPlumb.detach(connection);
                removeUnconnectedTargetEndpoints()
            });

        },
        alert: function (caption, message, type) {
            var text_escape = message.indexOf("<html>") == -1 ? true : false;

            $.pnotify({
                title: caption,
                text: message,
                type: type,
                text_escape: text_escape,
                opacity: .8,
                width: '20%',
                history: false
            });
        },
        createTask: function (ui) {
            var offset = this.$el.offset();

            console.log("Initializing TaskView")
            var view = new TaskView();

            var position = {top: ui.offset.top, left: ui.offset.left};
            var rendering = this.addView(view, position);

            this.model.addTask(rendering.model);
            this.model.trigger('change');

            return view;
        },
        updateJobName: function () {
//	    	$("#breadcrumb-project-name").text(this.model.get("Project Name"))
            $("#breadcrumb-job-name").text(this.model.get("Job Name"))
        },
        clean: function () {
            this.zoomArea.empty();
            jsPlumb.reset()
            this.initJsPlumb()
        },
        initLeftOffset: [],
        initTopOffset: [],
        addView: function (view, position) {

            var that = this;
            var rendering = view.render();
            this.zoomArea.append(rendering.$el);
            rendering.$el.offset(position);

            view.addSourceEndPoint('dependency')
            var initLeftOffset = [], initTopOffset = [];

            jsPlumb.draggable(rendering.$el,
                {
                    start: function (event, ui) {
                        var item = $(this);
                        var pos = item.position();
                        var items = $(".selected-task");

                        $.each(items || {}, function (key, value) {
                            var elemPos = $(value).position();
                            that.initLeftOffset[key] = elemPos.left - pos.left;
                            that.initTopOffset[key] = elemPos.top - pos.top;
                        });
                        //  items.trigger("start");
                        jsPlumb.repaint(items);
                        jsPlumb.repaint(item);


                    },
                    drag: function (event, ui) {
                        var item = $(this);
                        var pos = ui.offset;
                        var items = $(".selected-task");
                        $.each(items || {}, function (key, value) {

                            var oPos = {
                                left: pos.left + that.initLeftOffset[key],
                                top: pos.top + that.initTopOffset[key]
                            }, oEl = $(value);

                            oEl.offset(oPos);
                            jsPlumb.repaint(oEl, oPos);
                        });

                        // repaint the dragging item, passing in position
                        jsPlumb.repaint(item, pos);
                    },
                    stop: function (event, ui) {
                        var item = $(this);
                        var pos = $(this).offset();
                        var items = $(".selected-task");

                        $.each(items || {}, function (key, value) {
                            $(value).offset({
                                left: pos.left + that.initLeftOffset[key],
                                top: pos.top + that.initTopOffset[key]
                            });
                        });
                        jsPlumb.repaint(items);
                    },
                    containment: "#workflow-designer"
                }
            )

            this.taskViews.push(view);

            rendering.$el.data("view", view);
            return rendering;
        },
        removeView: function (view) {

            view.removing = true;
            var endPoints = jsPlumb.getEndpoints(view.$el)
            for (var i in endPoints) {
                try {
                    jsPlumb.deleteEndpoint(endPoints[i]);
                } catch (err) {
                    console.log(err)
                }
            }

            this.model.removeTask(view.model);
            view.$el.remove();
            jsPlumb.remove(view.$el);

            var index = this.taskViews.indexOf(view);
            if (index != -1) {
                this.taskViews.splice(index, 1);
            }

            this.$el.click();
        },
        import: function () {
            this.importNoReset();
            undoManager.reset()
        },
        importNoReset: function () {

            this.taskViews = [];

            var that = this;
            this.clean();

            this.model.on("change:Job Name", this.updateJobName, this);

            // to avoid model change by creating connections clean all jsplumb events
            jsPlumb.unbind();

            var task2View = {};
            $.each(this.model.tasks, function (i, task) {
                var view = new TaskView({model: task});

                that.addView(view, {top: 0, left: 0});
                task2View[task.get('Task Name')] = view;
            })

            //adding dependencies after all views exist
            $.each(this.model.tasks, function (i, task) {
                if (task.dependencies) {
                    $.each(task.dependencies, function (i, dep) {
                        if (task2View[dep.get('Task Name')]) {
                            var taskView = task2View[dep.get('Task Name')];
                            taskView.addDependency(task2View[task.get('Task Name')])
                        }
                    })
                }
                if (task.controlFlow) {
                    if (task.controlFlow.if) {
                        var taskIf = task2View[task.get('Task Name')];
                        if (taskIf) {
                            taskIf.addIf(task.controlFlow.if, task2View)
                        }
                    }
                    if (task.controlFlow.replicate) {
                        var taskReplicateView = task2View[task.get('Task Name')];
                        var taskDepView = task2View[that.model.getDependantTask(task.get('Task Name'))];
                        taskReplicateView.addReplicate(taskDepView);
                    }
                    if (task.controlFlow.loop) {
                        var loopTarget = task.controlFlow.loop.task;
                        var taskLoopView = task2View[task.get('Task Name')];
                        var targetView = task2View[loopTarget.get('Task Name')];
                        taskLoopView.addLoop(targetView)
                    }
                }
            })

            this.initJsPlumb();
            this.model.trigger('change');
            this.restoreLayout();
            // regenerating the form
            this.$el.click();
        },
        autoLayout: function () {
            var nodes = [];
            var taskWidth = 0;
            $(".task").each(function (i, task) {
                var t = $(task);
                nodes.push({id: t.attr('id'), width: t.width(), height: t.height()})
                taskWidth = t.width();
            })
            var edges = [];

            $.each(jsPlumb.getAllConnections(), function (i, con) {
                edges.push({sourceId: con.source.id, targetId: con.target.id})
            })
            // computing layout with dagre
            dagre.layout().nodes(nodes).edges(edges).nodeSep(50).rankSep(100).run();

            var workflowDesigner = $('#workflow-designer-outer')
            var containerPosition = workflowDesigner.position();
            // finding max left offset and top offset to center the graph
            var maxLeft = 0, maxTop = 0;
            $.each(nodes, function (i, node) {
                if (node.dagre.x > maxLeft) maxLeft = node.dagre.x;
                if (node.dagre.y > maxTop) maxTop = node.dagre.y;
            })

            var leftOffset = workflowDesigner.width() - maxLeft < 0 ? 0 : (workflowDesigner.width() - maxLeft) / 2 - taskWidth;
            var topOffset = workflowDesigner.height() - maxTop < 0 ? 100 : (workflowDesigner.height() - maxTop) / 2 + 50;

            $.each(nodes, function (i, node) {
                var pos = {};
                if (node.dagre.x) pos.left = node.dagre.x + containerPosition.left + leftOffset;
                if (node.dagre.x) pos.top = node.dagre.y + containerPosition.top + topOffset;
                $("#" + node.dagre.id).offset(pos)
            })
            jsPlumb.repaintEverything();
        },
        layoutNewElements: function (uiWithInitialOffset) {
            var offsets = this.options.projects.getOffsetsFromLocalStorage();
            if (!offsets) offsets = {};
            var elemWithInitialOffset = $(uiWithInitialOffset.draggable);

            // finding task that are not layouted
            var nodes = [];
            $.each(this.model.tasks, function (i, task) {
                var taskName = task.get("Task Name");
                var offset = offsets[taskName];
                if (!offset || (offset && offset.left==0 && offset.top==0)) {
                    //nodes.push({id: taskName, task: task, width: elemWithInitialOffset.width(), height: elemWithInitialOffset.height()});
                    nodes.push({id: taskName, task: task, width: 78, height: 28});
                }
            })

            var edges = [];

            $.each(nodes, function (i, node) {
                var task = node.task;

                if (task.dependencies) {
                    $.each(task.dependencies, function (i, dep) {
                        edges.push({sourceId: dep.get("Task Name"), targetId: task.get("Task Name")})
                    })
                }
                if (task.controlFlow) {
                    if (task.controlFlow.if) {
                        if (task.controlFlow.if.task) {
                            edges.push({sourceId: task.get("Task Name"), targetId: task.controlFlow.if.task.get("Task Name")})
                        }
                        if (task.controlFlow.if.else && task.controlFlow.if.else.task) {
                            edges.push({sourceId: task.get("Task Name"), targetId: task.controlFlow.if.else.task.get("Task Name")})
                        }
                        if (task.controlFlow.if.continuation && task.controlFlow.if.continuation.task) {
                            edges.push({sourceId: task.get("Task Name"), targetId: task.controlFlow.if.continuation.task.get("Task Name")})
                        }
                    }
                    // replicate and loop control flows require dependencies
                    // so they will be layouted correctly
                }
            });

            // computing layout with dagre
            dagre.layout().nodes(nodes).edges(edges).nodeSep(50).rankSep(100).run();

            var leftOffset = uiWithInitialOffset.offset.left-(elemWithInitialOffset.width()/2)+50;
            var topOffset = uiWithInitialOffset.offset.top-10;

            $.each(nodes, function (i, node) {
                var pos = {};
                if (node.dagre.x) pos.left = node.dagre.x + leftOffset;
                if (node.dagre.x) pos.top = node.dagre.y + topOffset;
                offsets[node.dagre.id] = pos;
            })

            this.options.projects.saveOffsetsToLocalStorage(offsets);
        },
        restoreLayoutFromOffsets: function (offsets) {
            var that = this;

            $('.task').each(function () {
                var taskName = $(this).find("span.name").text()
                var offset = offsets[taskName]
                var autolayout = false;

                if (offset) {
                    if (offset.left==0 && offset.top==0) {
                        autolayout = true;
                    }
                    $(this).offset(offset)
                } else {
                    autolayout = true;
                }

                if (autolayout) {
                    console.log("ERROR: enforce autolayout because of invalid offsets")
                    that.autoLayout();
                    return false;
                }

            })
            jsPlumb.repaintEverything();
        },
        restoreLayout: function () {
            var offsets = this.options.projects.getOffsetsFromLocalStorage();
            if (offsets) {
                this.restoreLayoutFromOffsets(offsets);
            } else {
                this.autoLayout();
            }
        },
        zoom: 1,
        setZoom: function (zoom) {
            if (zoom) this.zoom = zoom;

            var p = [ "-webkit-", "-moz-", "-ms-", "-o-", "" ],
                s = "scale(" + this.zoom + ")";

            for (var i = 0; i < p.length; i++)
                this.zoomArea.css(p[i] + "transform", s);

            jsPlumb.setZoom(this.zoom);
        },
        zoomIn: function () {
            if (this.zoom < 2) {
                this.zoom += 0.3;
                this.setZoom(this.zoom)
            }
        },
        zoomOut: function () {
            if (this.zoom > 0.4) {
                this.zoom -= 0.3;
                this.setZoom(this.zoom)
            }
        },
        getTaskViewByName: function (name) {
            return _.find(this.taskViews, function (view) {
                return (name === view.model.get("Task Name"));
            })
        },
        copyPasteTasks: function (tasks) {

            // to avoid model change by creating connections clean all jsplumb events
            jsPlumb.unbind();

            var thizz = this;
            var StudioApp = require('StudioApp');
            var jobModel = StudioApp.models.jobModel;

            var newTaskViews = {};
            $.each(tasks, function (i, t) {
                var task = $(t);
                var taskView = task.data("view");

                var newTaskModel = jQuery.extend(true, {}, taskView.model);

                // cloning of scripts in branches does not work properly
                // do it manually here
                if (newTaskModel.controlFlow) {
                    if (newTaskModel.controlFlow.if) {
                        newTaskModel.controlFlow.if.model = newTaskModel.controlFlow.if.model.clone()
                    }
                    if (newTaskModel.controlFlow.replicate) {
                        newTaskModel.controlFlow.replicate.model = newTaskModel.controlFlow.replicate.model.clone()
                    }
                    if (newTaskModel.controlFlow.loop) {
                        newTaskModel.controlFlow.loop.model = newTaskModel.controlFlow.loop.model.clone()
                    }
                }

                var suffix = 2;
                var newTaskName = newTaskModel.get("Task Name") + suffix;
                while (jobModel.getTaskByName(newTaskName)) {
                    suffix += 1;
                    newTaskName = newTaskModel.get("Task Name") + suffix
                }

                newTaskModel.set("Task Name", newTaskName)
                jobModel.addTask(newTaskModel);

                var newTaskView = new TaskView({model: newTaskModel});
                thizz.addView(newTaskView, {top: taskView.$el.offset().top + 100, left: taskView.$el.offset().left + 100});

                newTaskViews[taskView.model.get("Task Name")] = newTaskView;
            })
            // process dependencies
            $.each(newTaskViews, function (name, taskView) {
                if (taskView.model.dependencies) {
                    var newDependencies = [];
                    $.each(taskView.model.dependencies, function (i, task) {
                        var copiedTaskView = newTaskViews[task.get("Task Name")];
                        if (copiedTaskView) {
                            newDependencies.push(copiedTaskView.model)
                            copiedTaskView.addDependency(taskView);
                        }
                    })
                    taskView.model.dependencies = newDependencies;
                }
            })
            // process control flows
            $.each(newTaskViews, function (oldTaskName, taskView) {
                var task = taskView.model;
                if (task.controlFlow) {
                    if (task.controlFlow.if) {
                        taskView.addIf(task.controlFlow.if, newTaskViews)
                        // switching cloned model to new tasks
                        if (task.controlFlow.if.task && newTaskViews[task.controlFlow.if.task.get("Task Name")]) {
                            task.controlFlow.if.task = newTaskViews[task.controlFlow.if.task.get("Task Name")].model;
                        } else {
                            delete task.controlFlow['if']['task'];
                        }
                        if (task.controlFlow.if.else && task.controlFlow.if.else.task && newTaskViews[task.controlFlow.if.else.task.get("Task Name")]) {
                            task.controlFlow.if.else.task = newTaskViews[task.controlFlow.if.else.task.get("Task Name")].model;
                        } else {
                            delete task.controlFlow['if']['else'];
                        }
                        if (task.controlFlow.if.continuation && task.controlFlow.if.continuation.task && newTaskViews[task.controlFlow.if.continuation.task.get("Task Name")]) {
                            task.controlFlow.if.continuation.task = newTaskViews[task.controlFlow.if.continuation.task.get("Task Name")].model;
                        } else {
                            delete task.controlFlow['if']['continuation'];
                        }
                    }
                    if (task.controlFlow.replicate) {
                        var taskDepView = newTaskViews[jobModel.getDependantTask(oldTaskName)];
                        taskView.addReplicate(taskDepView);
                    }
                    if (task.controlFlow.loop) {
                        var loopTarget = task.controlFlow.loop.task;
                        var targetView = newTaskViews[loopTarget.get('Task Name')];
                        taskView.addLoop(targetView)
                    }
                }
            })

            this.initJsPlumb();
        },
        getOpenAccordions: function () {
            var result = {job: this.openedAccordion};
            $.each(this.taskViews, function (i, taskView) {
                var taskName = taskView.model.get("Task Name");
                result[taskName] = taskView.openedAccordion;
            });
            return result;
        },
        restoreOpenAccordions: function (openAccordions) {
            if (openAccordions.job) {
                this.openedAccordion = openAccordions.job;
            }
            var that = this;
            $.each(openAccordions, function (taskName, accordion) {
                var taskView = that.getTaskViewByName(taskName);
                if (taskView && accordion) {
                    taskView.openedAccordion = accordion;
                }
            })
        },
        getActiveTask: function () {
            return $("#breadcrumb-task-name").text();
        },
        restoreActiveTask: function (taskName) {
            $("span.name").each(function (i, el) {
                if ($(el).text() === taskName) {
                    $(el).click()
                }
            })
        }
    });

})