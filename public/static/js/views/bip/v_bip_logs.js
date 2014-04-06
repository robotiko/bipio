define([
    'underscore',
    'backbone',
    'bipclient',
    'c_bip_log',
    'moment'
    ], function(_, Backbone, BipClient, BipLogCollection){
        BipLogsView = Backbone.View.extend({
            //el: '#bip-setup',

            events: {                
                'click a.prev' : 'previous',
                'click a.next' : 'next'
            },
            initialize:function (container, bipId) {
                var self = this;
                _.bindAll(
                    this,
                    'render',
                    'previous',
                    'next'                    
                );
                this.el = container;
                this.collection = new BipLogCollection(bipId);
                this.collection.fetch({
                    success : this.render
                });
            },

            render : function() {
                var models = this.collection.models,
                    el = $(this.el),
                    logDate;
                    
                for (var i = 0; i < models.length; i++) {
                    
                    logDate = moment(parseInt(models[i].get('created'))).format('MMMM Do YYYY, h:mm:ss a');
                    
                    
                    el.append('<tr><td>' + logDate + '</td><td>' + models[i].get('code') + '</td><td>' + models[i].get('message') + '</td></tr>');
                }
            },

            previous: function(ev) {
                ev.preventDefault();
                if ($(ev.currentTarget).hasClass('disabled')) {
                    return;
                }
                this.collection.prevPage();
                return false;
            },

            next: function(ev) {
                ev.preventDefault();
                if ($(ev.currentTarget).hasClass('disabled')) {
                    return;
                }
                this.collection.nextPage();
                return false;
            }
          
        });

        return BipLogsView;
    });