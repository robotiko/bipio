define([
    'underscore',
    'backbone',
    'bipclient',
    ], function(_, Backbone, BipClient){
        // Individual Domain
        var MountView = Backbone.View.extend({
            el : $('#mount-ctl'),
            tpl : _.template($('#tpl-mount-entity').html()),
            events: {
                "click #mount-new-btn" : "publish",
                "click .btn-verify" : "verify",
                "click .btn-delete" : "remove",
                "click .btn-active" : "activate"
            },
            initialize: function(){
                _.bindAll(this, 'render', 'renderRow', '_validate', 'verify', 'activate', 'appendRow', 'errTranslate', 'remove', 'removeRow', 'updateRow', 'publish');
                this.collection.bind('reset', this.render);
            },
            renderRow : function(mount) {
                var struct = mount.toJSON(), html;
                return this.tpl(struct);
            },
            updateRow : function(mount) {
                var innerHTML = $('.well', this.renderRow(mount));
                $('#mount-entity-' + mount.id).html(innerHTML);
            },
            removeRow : function(mount) {
                $('#mount-entity-' + mount.id).remove();
            },
            appendRow : function(mount) {
                var el = $('#mount-list', this.el);
                el.append(this.renderRow(mount));
            },
            render: function(){
                var self = this;
                $('#mount-list', this.el).html('');
                this.collection.models.forEach( function (mount) {
         
                    self.appendRow(mount);
                });
                $('.tooltippable').tooltip();
                return this;
            },
            // translates from a model attribute to form, and renders an error
            errTranslate: function(isErr, error) {
                var el = $('#mount-name-new', this.el).parent();
                if (isErr) {
                    el.addClass('error');
                    el.children('.help-block').html(error);
                } else {
                    el.removeClass('error');
                    el.children('.help-block').html('');
                }
            },
            publish : function(ev) {
                var self = this;
                this._validate(function(mount) {
                    self.collection.create(mount);
                    self.render();
                });
            },
            
            activate : function(ev) {
                this.collection.activate($(ev.currentTarget).attr('data-model-id'));
                this.render(); 
            },
            
            verify : function(ev) {
                this._validate(undefined, $(ev.currentTarget).attr('data-model-id'));
            },
            
            _validate : function(next, id) {
                var form = $('form#new-mount'),
                    label = form.find('#mount-label'),
                    url = form.find('#mount-endpoint'),
                    username = form.find('#mount-username'),
                    token = form.find('#mount-token'),
                    sessionOnly = form.find('#mount-session-only'),
                    els = {

                        label : label,
                        url : url,
                        username : username,
                        token : token,
                        sessionOnly : sessionOnly
                    }, 
                    v,
                    parent,
                    help,
                    passed = {},
                    ok = true;
                
                if (id && '' !== id) {
                    passed = this.collection.get(id).toJSON();                    
                } else {                
                    for (el in els) {
                        if (els.hasOwnProperty(el) && 'sessionOnly' !== el) {                        
                            v = els[el].val();
                            parent = els[el].closest('.control-group');
                            help = els[el].siblings('.help-block');

                            if (v !== '') {
                                passed[el] = v;
                                parent.removeClass('error');
                                help.html('');
                            } else {
                                parent.addClass('error');
                                help.html('required');                            
                                ok = false;
                            }
                        }
                    }
                }
                
                if (ok) {
                    BipClient.setCredentials(passed.username, passed.token);
                    $.ajax({
                        url : passed.url + '/login',
                        method : 'GET',
                        success : function() {
                            BipClient.growl(passed.label + ' looks alive');
                            BipClient.setCredentials();
                            next(passed);
                        },
                        error : function() {
                            BipClient.growl(passed.label + ' mount failed verification', 'error');    
                            BipClient.setCredentials();
                        }
                    });
                } else if (ok && next) {
                    next(ok, passed);                    
                }
            },

            remove : function(ev) {
                var src = $(ev.currentTarget),
                    id = src.attr('data-model-id'),
                    model = this.collection.get(id),
                    self = this;

                ev.preventDefault();
                model.destroy({
                    success : function(mount, response) {
                        self.removeRow(mount);
                        BipClient.growl('Mount Deleted');
                    },
                    error : function(model, response) {
                        console.log(reponse);
                    }
                });
            }
        });

        return MountView;
    });