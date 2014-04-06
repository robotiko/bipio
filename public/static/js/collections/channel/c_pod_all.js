define([
    'underscore',
    'backbone',
    'models/m_pod',
    'bipclient'
    ], function(_, Backbone, PodModel, BipClient){
        PodCollection = Backbone.Collection.extend({
            model: PodModel,
            // pods are a little different, they're an abstract we can
            // describe with RPC's
            url: BipClient.getPodDescriptions,
            initialize : function() {
                BipClient.setCollection('pod', this);
            },            
            parse: function(response) {
                var podArr = [];
                for (podName in response) {
                    response[podName].id = response[podName].name;
                    podArr.push(response[podName]);
                }
                return podArr;
            },
            getPod : function(path) {
                var tokens = path.split('.');                    
                return this.get(tokens[0]);                    
            },
            getActionSchema : function(path) {
                var tokens = path.split('.'),
                    pod, action,
                    ret;

                if (tokens.length === 2) {
                    pod = this.get(tokens[0]);
                    action = pod.get('actions')[tokens[1]];                    
                    if (action) {
                        ret = action;
                    }                    
                }
                
                return ret;                
            }
        });
        return PodCollection;
    });
