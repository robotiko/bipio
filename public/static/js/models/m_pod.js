define([
    'underscore',
    'backbone',
    'bipclient'
    ], function(_, Backbone, BipClient) {
        return Backbone.Model.extend({
            validate: function() {
            },
            initialize: function() {

            },
            getExports: function(action) {
                return this.actions[action].exports.properties;
            },
            getImports : function(action) {
                return this.get('actions')[action].imports.properties;
            }
        });
    });


