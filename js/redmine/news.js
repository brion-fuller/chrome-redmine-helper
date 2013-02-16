/**
 * News representation class
 * 
 * @class 
 * @returns {News}
 */
function News() {

}

/**
 * Load latest news list
 *
 * @param {Function} success
 * @param {Function} error
 */
News.prototype.load = function(success, error) {
    if (!success) {
        success = function() {};
    }
    if (!error) {
        error = function() {};
    }
    getLoader().get("news.json", success, error);
};