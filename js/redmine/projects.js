/**
 * Projects actions 
 * 
 * @class
 * @returns {com.rdHelper.Projects}
 */
com.rdHelper.Projects = {
    loaded: false,
    projects: {}
};

/**
 * Get length of projects
 * 
 * @returns {number}
 */
com.rdHelper.Projects.length = function() {
    return Object.keys(this.projects).length;
};

/**
 * Store current projects in storage
 *
 * @param {function()=} callback
 * @returns {void}
 */
com.rdHelper.Projects.store = function(callback) {
    callback = callback || function() {};
    chrome.storage.local.set({'projects': this.projects}, callback);
};

/**
 * Load projects from extension Memory
 *
 * @param {function()=} callback
 * @returns {void}
 */
com.rdHelper.Projects.load = function(callback) {
    callback = callback || function() {};
    (function(obj) {
        chrome.storage.local.get('projects', function(item) {
            if (!item.projects) {
                callback();
                return;
            }
            obj.projects = item.projects;
            obj.loaded = true;
            callback();
        });
    })(this);
};

/**
 * Clear stored data & update current projects
 *
 * @returns {void}
 */
com.rdHelper.Projects.clear = function() {
    this.projects = {};
    this.loaded = false;
};

/**
 * Get list of projects
 * 
 * @param {boolean} reload if set to true project list will be updated from server
 * @param {function(Object)=} callback
 * @returns {Array}
 */
com.rdHelper.Projects.all = function(reload, callback) {
    if (arguments.length < 2 && typeof reload == "function") {
        callback = reload;
        reload = false;
    }
    callback = callback || function() {};
    if (this.loaded && !reload) {
        callback(this.projects);
    }
    (function(obj) {
        obj.load(function() {
            //If we have no projects there loading from API
            if (obj.length() < 1 || reload) {
                return obj.loadFromRedmine(callback);
            }
            callback(obj.projects);
        });
        return;
    })(this);
};

/**
 * Load projects from Redmine API
 *
 * @param {number=} offset
 * @param {function()=} callback
 */
com.rdHelper.Projects.loadFromRedmine = function(offset, callback) {
    if (arguments.length < 2 && typeof offset == "function") {
        callback = offset;
        offset = 0;
    }
    callback = callback || function() {};
    //update process
    (function(obj) {
        offset = offset || "0";
        redmineApi.projects.all("offset="+offset, function(error, data) {
            if (error) {
                callback({});
                return;
            }
            if (data.total_count && data.total_count > 0) {
                for(var i = 0; i < data.projects.length; i++) {
                    obj.projects[data.projects[i].id] = data.projects[i];
                }
                obj.loaded = true;
                obj.store();
                if (data.total_count > (data.limit + data.offset)) {
                    obj.loadFromRedmine(data.limit + data.offset, callback);
                } else {
                    callback(obj.projects);
                    chrome.extension.sendMessage({action: "projectsLoaded", projects: obj.projects});
                }
            }
        });
        return;
    })(this);
};

/**
 * Get project from list by identifier
 *
 * @param {(string|number)} ident
 * @returns {(Object|boolean)}
 */
com.rdHelper.Projects.getByIdentifier = function(ident) {
    for(var pid in this.projects) {
        if (this.projects[pid].identifier == ident) {
            return this.projects[pid];
        }
    }
    return false;
};

/**
 * Get project from list by id
 *
 * @param {(string|number)} id
 * @returns {(Object|boolean)}
 */
com.rdHelper.Projects.getById = function(id) {
    if (this.projects[id]) {
        return this.projects[id];
    }
    return false;
};

/**
 * Get project id from list by identifier
 *
 * @param {string} ident
 * @returns {int}
 */
com.rdHelper.Projects.getProjectKey = function(ident) {
    for(var pid in this.projects) {
        if (this.projects[pid].identifier == ident) {
            return pid;
        }
    }
    return false;
};

/**
 * Get project detailed info 
 * 
 * @param {(string|number)} id
 * @param {boolean} reload
 * @returns {(Object|boolean)}
 */
com.rdHelper.Projects.get = function(id, reload) {
    if (!this.projects[id]) {
        return false;
    }
    if (this.projects[id].fullyLoaded && !reload) {
        //load members if they wa not loaded
        this.getMembers(id);
        return this.projects[id];
    }
    (function(obj) {
        redmineApi.projects.get(id, function(error, data) {
            if (error) {
                return;
            }
            data.project.fullyLoaded = true;
            obj.projects[id] = merge(obj.projects[id], data.project);
            obj.store();
            obj.sendProjectUpdated(id, obj.projects[id]);
        });
        return;
    })(this);
    return this.projects[id];
};

/**
 * Get list of project members
 * 
 * @param {(string|number)} projectId
 * @param {boolean} reload
 * @returns {Array}
 */
com.rdHelper.Projects.getMembers = function(projectId, reload) {
    //check for project
    if (!this.projects[projectId]) {
        return [];
    }
    if (!reload && this.projects[projectId].membersLoaded) {
        return this.projects[projectId].members;
    }
    (function(obj) {
        redmineApi.projects.memberships(projectId, function(error, json) {
            if (error) {
                if (error.request.status && error.request.status == 403) {
                    obj.projects[projectId].membersLoaded = true;
                    obj.projects[projectId].members = com.rdHelper.Users.users;
                    obj.store();
                    obj.sendProjectUpdated(projectId, obj.projects[projectId]);
                }
                return;
            }
            if (json.total_count && json.total_count > 0 && json.memberships) {
                obj.projects[projectId].members = [];
                for (var i in json.memberships) {
                    obj.projects[projectId].members.push(json.memberships[i].user);
                }
                obj.projects[projectId].membersLoaded = true;
                obj.store();
                obj.sendProjectUpdated(projectId, obj.projects[projectId]);
            }
        });
    })(this);
    return [];
};

/**
 * Send notification that project was updated
 * 
 * @param {String} id
 * @param {Object} project
 * @returns {void}
 */
com.rdHelper.Projects.sendProjectUpdated = function(id, project) {
    chrome.extension.sendMessage({"action": "projectUpdated", "project": project});
};

/**
 * Get list of issues for project
 * 
 * @param {String} id project identifier
 * @param {int} offset
 * @param {boolean} reload
 * @returns {Array}
 */
com.rdHelper.Projects.getIssues = function(id, offset, reload) {
    if (!this.projects[id]) {
        return [];
    }
    if (this.projects[id].issuesLoaded && !reload) {
        return this.projects[id].issues;
    }
    if (reload || !this.projects[id].issues) {
        //clear issues
        this.projects[id].issues = [];
    }
    offset = offset || 0;
    var limit = 50;
    (function(obj, key, limit) {
        var filters = "sort=updated_on:desc&project_id="+id+"&limit="+limit+"&offset="+offset;
        redmineApi.issues.all(filters, function(error, json) {
            if (error) {
                return;
            }
            if (!json.issues || !json.total_count || json.total_count < 1) {
                return [];
            }
            for(var i in json.issues) {
                obj.projects[key].issues.push(json.issues[i]);    
            }
            obj.projects[key].issuesLoaded = true;
            obj.sendProjectUpdated(id, obj.projects[key]);
            obj.store();
            /**
             * Load rest of issues for selected project
             */
            if (json.total_count > (offset + limit)) {
                obj.getIssues(obj.projects[key].id, (offset + limit), false);
            }
        });
    })(this, id, limit);
    return [];
};