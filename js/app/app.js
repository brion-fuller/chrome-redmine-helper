'use strict';

/**
 * Create angular application
 */
angular.module('issues', ['ngRoute', 'ngSanitize', 'Issues.Service']).
    config(['$routeProvider', function($routeProvider) {
        $routeProvider.
            when('/options', {templateUrl: 'partials/options.html', controller: Options}).
            when('/home', {templateUrl: 'partials/home.html', controller: Home}).
            when('/news', {templateUrl: 'partials/news.html', controller: News}).
            when('/projects', {templateUrl: 'partials/projects.html', controller: Projects}).
            when('/timelines', {templateUrl: 'partials/timelines.html', controller: Timelines}).
            when('/new_issue', {templateUrl: 'partials/newIssue.html', controller: NewIssue}).
            otherwise({redirectTo: '/home'});
    }])
    .filter('tohours', function() {
        return function(time) {
            var hours = time / (1000*60*60);
            if (hours < 1) {
                return Math.round(time / (1000*60))+" min.";
            }
            return (hours).toFixed(1) + " h.";
        };
    }).filter('nl2br', function() {
        return function(string,is_xhtml) {
            var is_xhtml = is_xhtml || true;
            var breakTag = (is_xhtml) ? '<br />' : '<br>';
            var text = (string + '').replace(/([^>\r\n]?)(\r\n|\n\r|\r|\n)/g, '$1'+ breakTag +'$2');
            return text;
        };
    }).filter('comment', function() {
        //^>.*
        return function(string) {
            return string.replace(/\>(.*)\<br \/\>/g, '<blockquote class="comment">$1</blockquote>');
//        return string;
        };
    }).filter('pager', function() {
        return function(input, start) {
            start = +start; //parse to int
            return input.slice(start);
        };
        // Register the 'myCurrentTime' directive factory method.
        // We inject no service since the factory method is DI.
    }).run(['$rootScope', function($scope) {

    }]);

/**
 * Bind tooltips
 *
 * @param {jQuery} $
 */
jQuery(document).ready(function($) {
    $('.container').tooltip({
        selector: "i[data-type='tooltip']"
    });

    //Popover
    $('.container').popover({
        selector: ".help[data-type='popover']",
        trigger: "hover",
        placement: "top"
    });
});

/**
 * Open Issue Author's Redmine page
 *
 * @param {int} userId
 * @returns {undefined}
 */
function openAuthorPage(userId) {
    chrome.tabs.create({url: BG.getConfig().getHost()+"users/"+userId});
}