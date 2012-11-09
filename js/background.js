var pollIntervalMin = 5;  // 5 minutes
var pollIntervalMax = 60;  // 1 hour
var requestFailureCount = 0;  // used for exponential backoff

/**
 * 
 * @class Config
 * @returns {Config}
 */
function Config() {
    this.profile = {
        host: "",
        apiAccessKey: "",
        useHttpAuth: false,
        httpUser: "",
        httpPass: "",
        selectedProject: false,
        currentUserName: false,
        currentUserId: false
    };
    this.loaded = false;
}

/**
 * Check if config is empty
 * 
 * @returns {boolean}
 */
Config.prototype.isEmpty = function() {
    return (this.profile.host == "" && this.profile.apiAccessKey == "");
};

/**
 * Create new exmpty config in localstorage
 * 
 * @returns {void}
 */
Config.prototype.initNew = function() {
    this.store(this.profile);
};

/**
 * Check if configs are already loaded
 * 
 * @return {boolean}
 */
Config.prototype.isLoaded = function() {
    return this.loaded;
};

/**
 * Load config from locaStorage
 */
Config.prototype.load = function() {
    if (this.isLoaded()) {
        return;
    }
    var profile = localStorage.profile || false;
    if (!profile) {
        this.initNew();
        this.loaded = true;
        return;
    }
    this.profile = JSON.parse(profile);
    this.loaded = true;
    return;
};

/**
 * Store given profile into localStorage
 * 
 * @param {Object} profile
 * @returns {void}
 */
Config.prototype.store = function(profile) {
    if (profile.host.lastIndexOf("/") != (profile.host.length - 1)) {
        profile.host += "/";
    }
    localStorage['profile'] = JSON.stringify(profile);
};

/**
 * Get host for Redmine
 * 
 * @returns {String} Host
 */
Config.prototype.getHost = function() {
    return this.profile.host;
};

/**
 * Get user apiAccessKey
 * 
 * @returns {String} apiAccessKey
 */
Config.prototype.getApiAccessKey = function() {
    return this.profile.apiAccessKey;
};

/**
 * Get profile
 * 
 * @returns {Object}
 */
Config.prototype.getProfile = function() {
    this.load();
    return this.profile;
};

/**
 * 
 * @param {string} id
 * @returns {void}
 */
Config.prototype.setSelectedProject = function(id) {
    if (projects.getById(id).project !== false) {
        this.profile.selectedProject = id;
        this.store(this.profile);
    }
};

/**
 * 
 * @class
 * @returns {Loader}
 */
function Loader() {
}

/**
 * Create new XMLHttpRequest Object
 * 
 * @param {String} method
 * @param {String} url
 * @param {boolean} async
 */
Loader.prototype.createXhr = function(method, url, async) {
    var xhr = new XMLHttpRequest();
    var fullUrl = getConfig().getHost() + url;
    if (config.getProfile().useHttpAuth) {
        xhr.open(method, fullUrl, (async || true), config.getProfile().httpUser, config.getProfile().httpPass);
    } else {
        xhr.open(method, fullUrl, (async || true));
    }
    xhr.setRequestHeader("Content-Type", "application/json;charset=UTF-8");
    xhr.setRequestHeader("X-Redmine-API-Key", getConfig().getApiAccessKey());
    return xhr;
};

/**
 * Send GET request to URL
 * 
 * @param {string} url
 * @param {Function} success
 * @returns {void}
 */
Loader.prototype.get = function(url, success, error) {
    var xhr = this.createXhr("GET", url);
    //Check input date
    success = success || function(data) {};
    error = error || function() {};
//    error = error || function(e, xhr) {};
    //success handler
    xhr.onload = function(e) {
        if (this.status == 200) {
            var data = JSON.parse(this.response);
            success(data);
        } else {
            error(e, this);
        }
    };
    //error handler
    xhr.onerror = requestError;
    xhr.send();
};

/**
 * Projects actions 
 * 
 * @class
 * @returns {Projects}
 */
function Projects() {
    this.loaded = false;
    this.projects = [];
}

/**
 * Get list of projects
 * 
 * @param {boolean} reload if set to true list will be updated from server
 * @returns {Array}
 */
Projects.prototype.all = function(reload) {
    if (this.loaded && !reload) {
        return this.projects;
    }
    //Try loading from memory
    this.loadFromMemory();
    //If we have no projects there loading from API
    if (this.projects.length < 1 || reload) {
        this.loadFromRedmine();
    }
    return this.projects;
};

/**
 * Get project detailed info 
 * 
 * @param {String} id
 * @param {boolean} reload
 * @returns {Object}
 */
Projects.prototype.get = function(id, reload) {
    var p = this.getById(id);
    if (!p.project) {
        return false;
    }
    if (p.project.fullyLoaded && !reload) {
        //load members if they wa not loaded
        this.getMembers(id);
        return p.project;
    }
    (function(obj) {
        getLoader().get("projects/"+id+".json?include=trackers,issue_categories", function(data) {
            data.project.fullyLoaded = true;
            var key = p.key || false;
            if (key !== false) {
                obj.projects[key] = merge(obj.projects[key], data.project);
                obj.store();
                obj.sendProjectUpdated(id, obj.projects[key]);
            }
        });
    })(this);
    return p;
};

/**
 * Get list of project members
 * 
 * @param {int} projectId
 * @param {boolean} reload
 * @returns {Array}
 */
Projects.prototype.getMembers = function(projectId, reload) {
    var proj = this.getById(projectId);
    if (!proj || !proj.project) {
        return [];
    }
    if (!reload && proj.project.membersLoaded) {
        return proj.project.members;
    }
    (function(obj) {
        getLoader().get("projects/"+projectId+"/memberships.json", function(json) {
            console.log(json);
        }, function(e, resp) {
            if (resp.status && resp.status == 403) {
                obj.projects[proj.key].membersLoaded = true;
                obj.projects[proj.key].members = [];
                obj.store();
                console.log(obj.projects[proj.key]);
            }
        });
    })(this);
};

/**
 * Get project from list by identifier
 * 
 * @param {String} ident
 * @returns {Object}
 */
Projects.prototype.getByIdentifier = function(ident) {
    for(var pid in this.projects) {
        if (this.projects[pid].identifier == ident) {
            return {'key': pid, 'project': this.projects[pid]};
        }
    }
    return false;
};

/**
 * Get project from list by id
 * 
 * @param {String} id
 * @returns {Object}
 */
Projects.prototype.getById = function(id) {
    var project = {
        'key': false,
        'project': false
    };
    for(var pid in this.projects) {
        if (this.projects[pid].id == id) {
            project = {'key': pid, 'project': this.projects[pid]};
        }
    }
    return project;
};

/**
 * Get project id from list by identifier
 * 
 * @param {String} ident
 * @returns {int}
 */
Projects.prototype.getProjectKey = function(ident) {
    for(var pid in this.projects) {
        if (this.projects[pid].identifier == ident) {
            return pid;
        }
    }
    return false;
};

/**
 * Load projects from Redmine API
 * 
 * @returns {void}
 */
Projects.prototype.loadFromRedmine = function() {
    //update process
    this.projects = [];
    (function(obj) {
        getLoader().get("projects.json", function(data) {
            if (data.total_count && data.total_count > 0) {
                obj.projects = data.projects;
                obj.loaded = true;
                obj.store();
                chrome.extension.sendMessage({action: "projectsLoaded", projects: obj.projects});
            }
        });
    })(this);
};

/**
 * Store current projects 
 * 
 * @returns {void}
 */
Projects.prototype.store = function() {
    if (!this.loaded) {
        return;
    }
    localStorage['projects'] = JSON.stringify(this.projects);
};

/**
 * Load projects from extension Memory
 * 
 * @returns {void}
 */
Projects.prototype.loadFromMemory = function() {
    if (this.loaded) {
        return;
    }
    this.projects = JSON.parse(localStorage.projects || "[]");
    this.loaded = true;
};

/**
 * Clear stored data & update current projects
 * 
 * @returns {void}
 */
Projects.prototype.clear = function() {
    localStorage.removeItem("projects");
    this.projects = [];
    this.loaded = false;
};

/**
 * Send notification that project was updated
 * 
 * @param {String} id
 * @param {Object} project
 * @returns {void}
 */
Projects.prototype.sendProjectUpdated = function(id, project) {
    chrome.extension.sendMessage({"action": "projectUpdated", "project": project});
};

/**
 * Get list of issues for project
 * 
 * @param {String} id project identifier
 * @returns {Array}
 */
Projects.prototype.getIssues = function(id) {
    var key = this.getProjectKey(id);
    if (this.projects[key].issuesLoaded) {
        return this.projects[key].issues;
    }
    (function(obj) {
        getLoader().get("issues.json?sort=updated_on:desc", function(data) {
            console.log(data);
        });
    })(this);
    return [];
};

/**
 * 
 * @class
 * @returns {Issues}
 */
function Issues() {
    this.lastUpdated = false;
    if (localStorage.lastUpdated) {
        this.lastUpdated = new Date(localStorage.lastUpdated);
    }
    this.issues = JSON.parse(localStorage.issues || "[]");
    this.unread = 0;
    
    this.statuses = JSON.parse(localStorage.issueStatuses || "[]");;
    this.statusesLoaded = localStorage.statusesLoaded || false;
    this.updateUnread(true);
}

Issues.prototype.updateUnread = function(updateBadge) {
    this.unread = 0;
    for(var i in this.issues) {
        if(!this.issues[i].read) {
            this.unread += 1;
        }
    }
    if (updateBadge) {
        setUnreadIssuesCount(this.unread);
    }
};

/**
 * Load issues list 
 * 
 * @param {int} offset load result offset
 * @param {int} limit Limit for results
 * @returns {void}
 */
Issues.prototype.load = function(offset, limit) {
    offset = offset || 0;
    offset = parseInt(offset);
    limit = limit || 25;
    (function(obj) {
        getLoader().get("issues.json?sort=updated_on:desc&assigned_to_id="+getConfig().getProfile().currentUserId+"&limit="+limit+"&offset="+offset, 
            function(data) {
                var updated = 0;
                if (data.total_count && data.total_count > 0) {
                    for(var i in data.issues) {
                        var found = false;
                        for(var key in obj.issues) {
                            //We found this issue
                            if (obj.issues[key].id == data.issues[i].id) {
                                found = true;
                                if (new Date(obj.issues[key].updated_on) < new Date(data.issues[i].updated_on)) {
                                    data.issues[i].read = false;
                                    obj.issues[key] = data.issues[i];
                                    updated += 1;
                                }
                            }
                        }
                        if (!found) {
                            data.issues[i].read = false;
//                            data.issues[i].updated = new Date(data.issues[i].updated_on);
                            obj.issues.push(data.issues[i]);
                            updated += 1;
                        }
                    }
                    obj.lastUpdated = new Date();
                    obj.updateUnread(true);
                    obj.store();
                    /**
                     * Update issue statuses
                     */
                    obj.loadStatuses();
                    /**
                     * Notify
                     */
                    chrome.extension.sendMessage({"action": "issuesUpdated"});
                    /**
                     * Load rest of issues
                     */
                    if (data.total_count > (offset + limit) && updated >= limit) {
                        obj.load((offset + limit), limit);
                    }
                }
            }
        );
    })(this);
};

/**
 * Get detailed issue information 
 * 
 * @param {Object} issue
 * @param {boolean} reload
 * @returns {undefined}
 */
Issues.prototype.get = function(issue, reload) {
    if (issue.detailsLoaded && !reload) {
        return;
    }
    (function(obj) {
        getLoader().get("issues/"+issue.id+".json?include=journals,changesets", function(json) {
            if (json.issue) {
                var is = obj.getById(json.issue.id);
                if (is) {
                    json.issue.detailsLoaded = true;
                    obj.issues[is.key] = merge(obj.issues[is.key], json.issue);
                    obj.store();
                    //notify all listeners
                    chrome.extension.sendMessage({action: "issueDetails", id: issue.id, issue: obj.issues[is.key]});
                }
            }
        });
    })(this);
};

/**
 * Mark issue read 
 * 
 * @param {int} id
 * @returns {undefined}
 */
Issues.prototype.markAsUnRead = function(id) {
    var issue = this.getById(id);
    this.issues[issue.key].read = false;
    this.unread += 1;
    setUnreadIssuesCount(this.unread);
    this.store();
};

/**
 * Mark issue read 
 * 
 * @param {int} id
 * @returns {undefined}
 */
Issues.prototype.markAsRead = function(id) {
    var issue = this.getById(id);
    this.issues[issue.key].read = true;
    this.unread -= 1;
    setUnreadIssuesCount(this.unread);
    this.store();
};

/**
 * Mark all issues read
 * 
 * @returns {undefined}
 */
Issues.prototype.markAllAsRead = function() {
    for(var i in this.issues) {
        this.issues[i].read = true;
    }
    this.store();
    this.updateUnread(true);
};

/**
 * Get issue by it's ID 
 * 
 * @param {int} id
 * @returns {Boolean}
 */
Issues.prototype.getById = function(id) {
    if (this.issues.length < 1) {
        return false;
    }
    for(var i in this.issues) {
        if (this.issues[i].id == id) {
            return {'key': i, 'issue': this.issues[i]};
        }
    }
    return false;
};

/**
 * Load statuses from API
 * 
 * @param {boolean} reload
 * @returns {Array}
 */
Issues.prototype.loadStatuses = function(reload) {
    if (this.statusesLoaded && !reload) {
        return this.statuses;
    }
    (function(obj) {
        getLoader().get("issue_statuses.json", function(json) {
            if (json.issue_statuses && json.issue_statuses.length > 0) {
                obj.statuses = json.issue_statuses;
                obj.statusesLoaded = true;
                obj.store();
                //notify all listeners
                chrome.extension.sendMessage({action: "issueStatusesUpdated", statuses: obj.statuses});
            }
        });
    })(this);
    return this.statuses;
};

/**
 * Get status name by id
 * @param {int} id
 * @returns {String}
 */
Issues.prototype.getStatusNameById = function(id) {
    if (!this.statusesLoaded) {
        this.loadStatuses();
        return id;
    }
    for (var key in this.statuses) {
        if (this.statuses[key].id == id) {
            return this.statuses[key].name;
        }
    }
    return id;
};

/**
 * Store data into localStorage
 * 
 * @returns {void}
 */
Issues.prototype.store = function() {
    localStorage['issues'] = JSON.stringify(this.issues);
    localStorage['lastUpdated'] = this.lastUpdated.toISOString();
    localStorage['issueStatuses'] = JSON.stringify(this.statuses);
    localStorage['statusesLoaded'] = this.statusesLoaded;
};

/**
 * Users representation class
 * 
 * @class 
 * @returns {Users}
 */
function Users() {
    this.loaded = localStorage.users_loaded || false;
    this.users = JSON.parse(localStorage.users || "[]");
}

/**
 * Load users from server
 * 
 * @param {boolean} reload 
 * @returns {undefined}
 */
Users.prototype.load = function(reload) {
    if (!reload && this.loaded) {
        return;
    }
    (function(obj) {
        getLoader().get("users.json", function(json) {
            console.log(json);
        });
    })(this);
};

/**
 * Store user data 
 * 
 * @returns {undefined}
 */
Users.prototype.store = function() {
   localStorage['users'] = JSON.stringify(this.users);
   localStorage['users_loaded'] = this.loaded;
};

/**
 * Init global variables
 */
var config = new Config(),
loader = new Loader(),
projects = new Projects(),
issues = new Issues();
/**
 * 
 * @type Users
 */
var users;

/**
 * Overwrites obj1's values with obj2's and adds obj2's if non existent in obj1
 * @param obj1
 * @param obj2
 * @returns obj3 a new object based on obj1 and obj2
 */
function merge(obj1,obj2){
    var obj3 = {};
    for (var attrname in obj1) { obj3[attrname] = obj1[attrname]; }
    for (var attrname in obj2) { obj3[attrname] = obj2[attrname]; }
    return obj3;
}

/**
 * 
 * @param {ProgressEvent} e
 * @returns {void}
 */
function requestError(e) {
    chrome.extension.sendMessage({action: "xhrError", params: {"e": e}});
    chrome.browserAction.setBadgeText({text: "Err"});
}

/**
 * Trim string 
 * @param {Strin} string
 */
function trim(string) {
    return string.replace(/^\s\s*/, '').replace(/\s\s*$/, '');
}

/**
 * Get Config 
 * 
 * @returns {Config}
 */
function getConfig() {
    config.load();
    return config;
}

/**
 * Get Loader
 * 
 * @returns {Loader}
 */
function getLoader() {
    return loader;
}

/**
 * 
 * @returns {Projects}
 */
function getProjects() {
    return projects;
}

/**
 * Get Issues
 * 
 * @returns {Issues}
 */
function getIssues() {
    return issues;
}

/**
 * Get Users
 * 
 * @returns {Users}
 */
function getUsers() {
    if (!users) {
        users = new Users();
    }
    return users;
}

/**
 * Set amount of unread issues
 * 
 * @param {int} count
 * @returns {void}
 */
function setUnreadIssuesCount(count) {
    //clear text
    if (count <= 0) {
        chrome.browserAction.setBadgeText({text: ""});
        return;
    }
    if (count > 99) {
        count = "99+";
    }
    chrome.browserAction.setBadgeText({text: ""+count});
}

/**
 * Remove all stored Redmine items from memory
 * 
 * @returns {void}
 */
function clearItems() {
    projects.clear();
    if (!config.isEmpty()) {
        startRequest({scheduleRequest:true});
    }
}

/**
 * Check if given URL is from Extension Main page
 * 
 * @param {String} url
 * @returns {Boolean}
 */
function isMainUrl(url) {
    var mainUrl = getMainUrl(true);
    if (url.indexOf(mainUrl) === 0) {
        return true;
    }
    return false;
}

/**
 * Get Extension Main page URL.
 * 
 * If absolute set to true function will return absolute URL :<br/> 
 * chrome-extension://extension-id/html/main.html 
 * 
 * @param {boolean} absolute
 * @returns {String}
 */
function getMainUrl(absolute) {
    if (!absolute) {
        return "html/main.html";
    } else {
        return chrome.extension.getURL("/html/main.html");
    }
}

/**
 * Will open new Extension Main page or set selected page that already open
 * 
 * @returns {void}
 */
function openMainPage() {
    chrome.tabs.getAllInWindow(undefined, function(tabs) {
        for (var i = 0, tab; tab = tabs[i]; i++) {
            if (tab.url && isMainUrl(tab.url)) {
                chrome.tabs.update(tab.id, {selected: true});
                return;
            }
        }
        chrome.tabs.create({url: getMainUrl()});
    });
}

/**
 * Shedule next request to Redmine
 */
function scheduleRequest() {
    var randomness = Math.random() * 2;
    var exponent = Math.pow(2, requestFailureCount);
    var multiplier = Math.max(randomness * exponent, 1);
    var delay = Math.min(multiplier * pollIntervalMin, pollIntervalMax);

    chrome.alarms.create({'delayInMinutes': delay});
}

/**
 * 
 * @param {type} onSuccess
 * @returns {void}
 */
function getCurrentUser(onSuccess) {
    getLoader().get("users/current.json",
        function(json) {
            if (json.user) {
                getConfig().getProfile().currentUserName = json.user.firstname + ' ' + json.user.lastname;
                getConfig().getProfile().currentUserId = json.user.id;
                getConfig().store(getConfig().getProfile());
                onSuccess();
            }
        }
    );
}

/**
 * Start requesting of issues
 * 
 * @param {Object} params
 * @returns {void}
 */
function startRequest(params) {
    if (params.scheduleRequest) {
        scheduleRequest();
    }
    if (getConfig().getHost() != "") {
        //check user
        if (!getConfig().getProfile().currentUserId || !getConfig().getProfile().currentUserName) {
            getCurrentUser(function() {
                startRequest({scheduleRequest: false});
            });
        } else {
            /**
             * Load list of issues
             */
            getIssues().load();
            /**
             * Load list of users
             */
//            getUsers().load();
        }
    } else {
        chrome.browserAction.setBadgeText({text: "Err"});
    }
}

/**
 * Bind actions on extension is installed
 */
chrome.runtime.onInstalled.addListener(function() {
    console.log("Installed");
    startRequest({scheduleRequest:true});
});

chrome.runtime.onSuspend.addListener(function() {
    console.log("Suspended");
});

/**
 * Run actions on timer
 */
chrome.alarms.onAlarm.addListener(function() {
    startRequest({scheduleRequest:true});
});

/**
 * Bind click action to icon
 */
chrome.browserAction.onClicked.addListener(openMainPage);