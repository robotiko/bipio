define([
    'underscore',
    'backbone',
    'bipclient'
    ], function(_, Backbone, BipClient) {
        MChannel = Backbone.Model.extend({
            defaults: {
                'id' : null,
                'name' : '',
                'action' : '',
                'config' : {},
                'note' : '',
                'app_id' : ''
                //'_emitter' : false
            },

            validation : {
                name : [
                    function(value) {
                        console.log(value);
                        console.log(this);
                        
                    },
                    {
                        required : true,
                        msg : 'name required'
                    },
                    {
                        maxLength : 64,
                        msg : 'name cannot exceed 64 characters'
                    }
                ],
                note : [
                    { 
                        required : false
                    },
                    {
                        maxLength : 1024,
                        msg : 'Note cannot exceed 1024 characters'
                    }
                ]                
            },

            initialize: function() {                
            },
            url: function() {
                var self = this;
                return BipClient.getResourceURL('channel', self);
            },
            getPodTokens : function() {
                return this.attributes.action.split('.');
            },
            getPod : function() {
              var tokens = this.getPodTokens();
              return BipClient.getCollection('pod').get(tokens[0]);
            }
        });
        
        
        
        return MChannel;
    });


