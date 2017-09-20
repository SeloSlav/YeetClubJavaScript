var $blogs = [];
var $comments = [];
var global_title = [];
var global_description = [];
var global_size_options = [];
var global_mfg = [];
var global_mfg_url = [];


// ########## DOCUMENT READY ##########
$(document).ready(function() {
    var isScrolledIntoView = function(el) {
        if (el) {
            var elemTop = el.getBoundingClientRect().top;
            var elemBottom = el.getBoundingClientRect().bottom;
            return (elemTop >= 0) && (elemBottom <= window.innerHeight);
        }
        return false;
    };
    var lastTime = new Date().getTime();
    $(window).scroll(function() {
        var el = document.getElementsByClassName('loading-image')[0];
        if (el && new Date().getTime() - lastTime > 1000 && isScrolledIntoView(el)) {
            lastTime = new Date().getTime();
            if (!$(el).hasClass('hide')) {
                $('#top').trigger('scrolledToBottom');
                $('a.author-username').trigger('scrolledToBottom');
            }
        }
    });

});



// ########## GLOBAL UTILITY FUNCTIONS ##########
var $generateUUID = function() {
    var d = new Date().getTime();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        var r = (d + Math.random() * 16) % 16 | 0;
        d = Math.floor(d / 16);
        return (c == 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
};

$(function() {
    // Enable jQuery for Parse
    Parse.$ = jQuery;

    // Connect to Parse API
    Parse.initialize(
        'GDprTC66bNMp3mXWNvWJbZhWwjedoucvp6NlNKVl',
        'UOLqt3c9rOgvuZ93CNLuFiaXBso6KrkkKyIhIZrC');
    Parse.serverURL = 'https://parseapi.back4app.com';

    // Register secureUrl
    Handlebars.registerHelper("secureUrl", function(url) {
        if (url && url.indexOf('https') < 0 && url.indexOf('http') == 0) {
            return url.replace('http', 'https');
        }
        return url;
    });

    // ########## MAIN APPLICATION ##########
    var BlogApp = new(Parse.View.extend({

        Models: {},
        Collections: {},
        Views: {},
        nodes: {},
        fn: {},

        template: Handlebars.compile($('#master-tpl').html()),

        render: function() {
            this.$el.html(this.template());
        },

        start: function() {
            this.render();
            this.$container = this.$el.find('.main-container');
            this.$sidebar = this.$el.find('.blog-sidebar');
            this.$nav = this.$el.find('.navbar-fixed');
            var router = new this.Router;
            router.start();
            this.fn.getSidebar();
        }

    }))({
        el: document.body
    });



    // ########## MODELS ##########
    // User
    BlogApp.Models.User = Parse.Object.extend('User');

    // Group
    BlogApp.Models.Group = Parse.Object.extend('Group');

    // Yeet - List Posts View
    BlogApp.Models.Blog = Parse.Object.extend('Yeet', {
        update: function(form) {

            if (!this.get('ACL')) {
                var blogACL = new Parse.ACL(Parse.User.current());
                blogACL.setPublicReadAccess(true);
                this.setACL(blogACL);
            }


            this.set({
                'currentGroup': this.get('currentGroup') || Parse.User.current().get('currentGroup'),
                'content': form.content,
                'author': this.get('author') || Parse.User.current(),
                'authorName': this.get('authorName') || Parse.User.current().get('username'),
                'time': this.get('time') || new Date().toDateString()
            }).save(null, {
                success: function(blog) {
                    Parse.history.navigate('#/admin', {
                        trigger: true
                    });
                    window.location.reload();
                },
                error: function(blog, error) {
                    console.log(error);
                }
            });
        }
    });

    // Comment
    BlogApp.Models.Comment = Parse.Object.extend('Yeet', {
        update: function(form) {
            var thisObj = this;
            var marketFeedQuery = new Parse.Query(BlogApp.Models.Blog);
            marketFeedQuery.equalTo('senderParseObjectId', BlogApp.blog);
            marketFeedQuery.find({
                success: function(comments) {
                    thisObj.set({
                        author: Parse.User.current(),
                        replyAuthor: Parse.User.current(),
                        email: form.email,
                        notificationText: form.content,
                        senderParseObjectId: BlogApp.blog.id,
                        likedBy: [],
                        repliedToBy: []
                    }).save(null, {
                        success: function(comment) {

                            var topLevelYeetQuery = new Parse.Query(BlogApp.Models.Blog);
                            topLevelYeetQuery.equalTo('objectId', BlogApp.blog.id);
                            topLevelYeetQuery.find({
                                success: function(yeets) {
                                    for (i in yeets) {
                                        yeets[i].set('lastReplyUpdatedAt', new Date());
                                        yeets[i].increment('repliedToBy', yeets[i].repliedToBy.push(Parse.User.current().id));
                                        yeets[i].increment('replyCount', 1);
                                        yeets[i].save();
                                    }

                                }
                            });

                            window.location.reload();
                        },
                        error: function(comment, error) {
                            console.log(error);
                        }
                    });

                }
            });
        }

    });


    // ########## COLLECTIONS ##########

    var currentUser = Parse.User.current();
    if (!currentUser) {
        console.log("There is no logged in user.");
    } else {
        var currentGroup = currentUser.get('currentGroup');
        // console.log(currentGroup.id);
        BlogApp.Collections.Blogs = Parse.Collection.extend({
            model: BlogApp.Models.Blog,
            query: (new Parse.Query(BlogApp.Models.Blog)).equalTo('groupId', currentGroup).include('author').descending('lastReplyUpdatedAt').limit(300)
        });
    }

    var user = Parse.User.current();
    BlogApp.Collections.UserDesigns = Parse.Collection.extend({
        model: BlogApp.Models.Blog,
        query: (new Parse.Query(BlogApp.Models.Blog)).equalTo("author", user).descending('lastReplyUpdatedAt').limit(300).include('author')
    });


    // ########## VIEWS ##########


    // Yeets List View
    BlogApp.Views.Blogs = Parse.View.extend({
        template: Handlebars.compile($('#blogs-tpl').html()),
        className: 'blog-post',
        events: {
            'click .delete-container': 'delete',
        },

        delete: function(e) {
            if (Parse.User.current()) {
                var bl = new BlogApp.Models.Blog();

                bl.id = $(e.currentTarget).data('blog-id');

                Materialize.toast('Succ! Yeet Deleted.', 4000, 'green');
                $('.' + bl.id).hide();

                bl.destroy({}, {
                    success: function(bl) {
                        // Materialize.toast('Succ! Yeet Deleted.', 4000, 'green');
                    },
                    error: function(bl, e1) {
                        console.log(e1);
                    }
                });
            }
        },

        render: function() {
            Parse.User.current().fetch();

            var collection = {
                blog: []
            };

            // console.log(this)
            collection = {
                user: currentUser,
                blog: this.options.blogs
            };

            // console.log(this.options.blogs);
            this.$el.html(this.template(collection));
        },
    });


    // Profile View
    BlogApp.Views.Welcome = Parse.View.extend({
        template: Handlebars.compile($('#welcome-tpl').html()),
        className: 'blog-sec',
        events: {
            'click .delete-container': 'delete',
        },

        delete: function(e) {
            if (Parse.User.current()) {
                var bl = new BlogApp.Models.Blog();

                bl.id = $(e.currentTarget).data('blog-id');

                Materialize.toast('Succ! Yeet Deleted.', 4000, 'green');
                $('.' + bl.id).hide();

                bl.destroy({}, {
                    success: function(bl) {
                        // Materialize.toast('Succ! Yeet Deleted.', 4000, 'green');
                    },
                    error: function(bl, e1) {
                        console.log(e1);
                    }
                });
            }
        },

        /*events: {
            'scrolledToBottom a.author-username': 'loadMore'
        },*/

        render: function() {
            var self = this,
                attributes = this.options.user.toJSON();
                // console.log(attributes);

            if (Parse.User.current() && Parse.User.current().id === attributes.objectId) {
                attributes.blogAdmin = true;
            }

            attributes.blog = $blogs;
            self.$el.html(self.template(attributes));
        },

        /*loadMore: function(e) {
            var username = $('a.author-username').text();
            (new Parse.Query(BlogApp.Models.User)).equalTo('username', username).find().then(function(users) {
                var q1 = new Parse.Query(BlogApp.Models.Blog);
                q1.equalTo("author", users[0]);

                var designsQuery = new Parse.Query(q1);
                designsQuery.skip($blogs.length).descending('lastReplyUpdatedAt').include('author').limit(50);

                designsQuery.find().then(function(userDesigns) {
                    for (var i in userDesigns) {
                        var des = userDesigns[i].toJSON();
                        des.author = userDesigns[i].toJSON();
                        $blogs.push(des);
                    }

                    BlogApp.fn.renderView({
                        View: BlogApp.Views.Welcome,
                        data: {
                            user: users[0],
                            designs: $blogs
                        }
                    });

                    if (userDesigns.length <= 50) {
                        $('.loading-image').addClass('hide');
                    } else {
                        $('.loading-image').removeClass('hide');
                    }
                });
            });
        }*/
    });


    // Single Yeet View
    BlogApp.Views.Blog = Parse.View.extend({
        template: Handlebars.compile($('#blog-tpl').html()),
        className: 'blog-comment',
        events: {
            'submit .form-comment': 'submit',
            'click .like-count-container': 'like',
        },

        submit: function(e) {
            e.preventDefault();
            var data = $(e.target).serializeArray();
            this.comment = new BlogApp.Models.Comment();
            this.comment.update({
                content: data[0].value
            });
        },

        like: function(e) {
            if (Parse.User.current() && $(e.currentTarget).data('proceed')) {
                var bl = new BlogApp.Models.Blog();

                var likers = bl.get('likedBy'),
                    liked = false;

                for (j in likers) {
                    if (likers[j] == Parse.User.current().id) {
                        liked = true;
                        break;
                    }
                }

                if (liked) {
                    Materialize.toast('You already liked this Yeet', 4000, 'red');
                }

                bl.id = $(e.currentTarget).data('blog-id');
                bl.increment('likesCount');
                bl.addUnique('likedBy', Parse.User.current().toJSON().objectId);
                bl.save({}, {
                    success: function(bl) {
                        $(e.currentTarget).attr('title', 'Yeet liked!');
                        /*$(e.currentTarget).find('span').text(bl.get('likesCount'));*/
                        window.location.reload();
                        Materialize.toast('Succ! Yeet Liked.', 4000, 'green');
                    },
                    error: function(bl, e1) {
                        console.log(e1);
                    }
                });
            }
        },

        render: function() {
            var self = this,
            attributes = this.model,
            query = new Parse.Query(BlogApp.Models.Blog);
            query.include("author");

            attributes.loggedIn = Parse.User.current() != null;
            if (attributes.loggedIn) {
                attributes.currentUser = Parse.User.current().toJSON();
            }

            // console.log(attributes);

            var Post = Parse.Object.extend("Yeet");
            var commentsQuery = new Parse.Query(Post);
            commentsQuery.include("author");
            commentsQuery.equalTo("senderParseObjectId", attributes.objectId);
            commentsQuery.find({
                success: function(comments) {
                    // console.log(comments);
                    attributes.comment = comments;
                    self.$el.html(self.template(attributes))
                }
            });

        }

    });


    // Navigation View Logic
    BlogApp.Views.Navigation = Parse.View.extend({
        className: 'sidebar-module',
        template: Handlebars.compile(Parse.User.current() ? $('#menu-logged-in-tpl').html() : $('#menu-logged-out-tpl').html()),
        render: function() {
            var attributes = Parse.User.current() ? Parse.User.current().toJSON() : {};

            this.$el.html(this.template(attributes));
        }
    });

    // Register View
    BlogApp.Views.Register = Parse.View.extend({
        template: Handlebars.compile($('#register-tpl').html()),
        className: 'blog-sec',

        events: {
            'submit .user-add': 'register',
        },

        register: function(e) {
            e.preventDefault();

            user = new Parse.User();

            var form = document.getElementById("user-add");

            var username = form.username.value;
            var password = form.password.value;
            var email = form.email.value;
            var name = form.name.value;

            user.set("username", username);
            user.set("password", password);
            user.set("email", email);
            user.set("name", name);

            var Group = Parse.Object.extend("Group");
            var query = new Parse.Query(Group);
            query.equalTo("objectId", "v30ajFHwnA");
            query.find({
                success: function(results) {
                    alert("Registration successful!");
                    // Do something with the returned Parse.Object values
                    for (var i = 0; i < results.length; i++) {
                        var groupObject = results[i];
                        user.set("currentGroup", groupObject);
                        user.set("myGroups", ["v30ajFHwnA"]);

                        user.signUp(null, {
                            success: function(user) {
                                form.submit();
                                blogRouter.navigate('#/admin', {
                                    trigger: true
                                });
                                window.location.reload();
                            },
                            error: function(user, error) {
                                alert("Error: " + error.code + " " + error.message);
                            }
                        });

                    }
                },
                error: function(error) {
                    alert("Error: " + error.code + " " + error.message);
                }
            });

        },

        render: function() {
            this.$el.html(this.template());
        }

    });

    // Login View
    BlogApp.Views.Login = Parse.View.extend({
        template: Handlebars.compile($('#login-tpl').html()),
        className: 'blog-sec',

        events: {
            'submit .form-signin': 'login'
        },

        login: function(e) {
            e.preventDefault();

            var data = $(e.target).serializeArray(),
                username = data[0].value,
                password = data[1].value;

            Parse.User.logIn(username, password, {
                success: function(user) {
                    Parse.history.navigate('#/admin', {
                        trigger: true
                    });
                    window.location.reload();
                },
                error: function(user, error) {
                    alert(error.message);
                }
            });

        },

        render: function() {
            this.$el.html(this.template());
        }

    });

    // Store View
    BlogApp.Views.Store = Parse.View.extend({
        template: Handlebars.compile($('#store-tpl').html()),
        className: 'blog-sec',

        render: function() {
            this.$el.html(this.template());
        }

    });

    // My Clubs View
    BlogApp.Views.MyClubs = Parse.View.extend({
        template: Handlebars.compile($('#myclubs-tpl').html()),
        className: 'blog-sec',

        render: function() {
            this.$el.html(this.template());
        }
    });

    // Notifications View
    BlogApp.Views.Notifications = Parse.View.extend({
        template: Handlebars.compile($('#notifications-tpl').html()),
        className: 'blog-post',
        events: {
            'mouseover .notification-container': 'setReadState',
        },

        setReadState: function(e) {
            // console.log("hovered!");
            var bl = new BlogApp.Models.Blog();
            bl.id = $(e.currentTarget).data('blog-id');
            // console.log(bl.id);
            $('.' + bl.id).css("backgroundColor", "white");

                var notificationsQuery = new Parse.Query("Notification").equalTo('objectId', bl.id);
                notificationsQuery.find({
                    success: function(notifications) {

                        // console.log("Set read state to true!");

                        for (var i in notifications) {
                            var not = notifications[i];
                            not.set("read", true);
                            not.save(null, {
                                success: function(savedUser) {
                                    // console.log("Notification saved!");
                                },
                                error: function(user, error) {
                                    console.log(JSON.stringify(error));
                                }
                            });
                        }

                    },
                    error: function(notifications, e) {
                        console.log(JSON.stringify(e));
                    }
                });            

        },

        render: function() {
            Parse.User.current().fetch();

            var collection = {
                blog: []
            };

            console.log(currentUser);

            // console.log(this)
            collection = {
                user: currentUser,
                blog: this.options.blogs
            };

            // console.log(this.options.blogs);
            this.$el.html(this.template(collection));
        },
    });

    // Reset Password View
    BlogApp.Views.Reset = Parse.View.extend({

        template: Handlebars.compile($('#reset-tpl').html()),

        className: 'blog-sec',

        events: {
            'submit .form-reset': 'reset'
        },

        reset: function(e) {
            e.preventDefault();

            var data = $(e.target).serializeArray();
            email = data[0].value;

            Parse.User.requestPasswordReset(email, {
                success: function() {
                    window.location.reload();
                },
                error: function(error) {
                    alert("Error: " + error.code + " " + error.message);
                }
            });

        },

        render: function() {
            this.$el.html(this.template());
        }

    });


    // Change Profile Picture View
    BlogApp.Views.ChangeProfilePicture = Parse.View.extend({

        template: Handlebars.compile($('#change-profile-pic-tpl').html()),

        className: 'blog-sec',

        events: {
            'submit .pic-add': 'submit',
        },

        submit: function(e) {
            e.preventDefault();

            var form = document.getElementById("pic-add");

            var fileUploadControl = $("#profilePhotoFileUpload")[0];
            var file = fileUploadControl.files[0];
            var name = file.name;
            var parseFile = new Parse.File(name, file);

            var user = Parse.User.current();
            user.set("profilePicture", parseFile);
            //form.submit();
            user.save(null, {
                success: function(savedUser) {
                    Parse.history.navigate('#/admin', {
                        trigger: true
                    });
                    window.location.reload();
                },
                error: function(user, error) {
                    alert(JSON.stringify(error));
                }
            });
        },

        render: function() {
            var self = this,
                attributes = this.model.toJSON();
            self.$el.html(self.template(attributes));
        }

    });

    // Edit Profile View
    BlogApp.Views.EditMyProfile = Parse.View.extend({

        template: Handlebars.compile($('#edit-my-profile-tpl').html()),

        className: 'blog-sec',

        events: {
            'submit .profile-details-edit': 'submit'
        },

        submit: function(e) {
            e.preventDefault();

            var form = document.getElementById("profile-details-edit");

            user = Parse.User.current();
            user.save().then(function() {
                var fullName = form.fullName.value;
                var bio = form.bio.value;
                var phoneNumber = form.phoneNumber.value;
                var username = form.editUsername.value;
                //user.set("name", fullName);
                //user.set("Bio", bio);
                //user.set("Phone", phoneNumber);
                //form.submit();
                user.save({
                    name: fullName,
                    bio: bio,
                    Phone: phoneNumber
                }, {
                    success: function(updatedUser) {
                        Parse.history.navigate('#/admin', {
                            trigger: true
                        });
                        window.location.reload();
                    },
                    error: function(user, e) {
                        alert("Could not save info " + JSON.stringify(e));
                    }
                });
            }, function(error) {
                console.log(error);
            });

        },

        render: function() {
            var self = this,
                attributes = this.model.toJSON();
            self.$el.html(self.template(attributes));
        }

    });

    // Send Yeet View
    BlogApp.Views.WriteBlog = Parse.View.extend({
        template: Handlebars.compile($('#write-tpl').html()),
        className: 'blog-sec',

        events: {
            'submit .form-write': 'submit'
        },

        submit: function(e) {
            e.preventDefault();
            var data = $(e.target).serializeArray();

            var newYeet = new BlogApp.Models.Blog();

            /*var imageFile = new Parse.File('image.png', {base64: document.getElementsByTagName('canvas')[0].toDataURL('image/png')});
            var compressedFile = new Parse.File('compressed_image.jpeg', {base64: document.getElementsByTagName('canvas')[0].toDataURL('image/jpeg', 0.1)});
            var thumbnailFile = new Parse.File('thumbnail.jpeg', {base64: document.getElementsByTagName('canvas')[0].toDataURL('image/jpeg', 0.01)});*/

            var acl = new Parse.ACL(Parse.User.current());
            acl.setPublicReadAccess(true);
            acl.setPublicWriteAccess(true);

            // Set values for Yeet object
            newYeet.setACL(acl);
            newYeet.set('author', Parse.User.current());
            newYeet.set('groupId', Parse.User.current().get('currentGroup'));
            newYeet.set('isRant', false);
            var likedBy = [];
            newYeet.set('likedBy', likedBy);
            var date = new Date();
            newYeet.set('lastReplyUpdatedAt', date);

            var yeetContent = document.getElementById('content').value;

            // If the Yeet is not empty then save to Parse
            if (yeetContent.length >= 1 && yeetContent.length <= 220) {
                newYeet.set('notificationText', yeetContent);

                newYeet.save().then(function(savedComment) {
                    // Succ message
                    Materialize.toast('Succ! Yeet Sent.', 4000, 'green');

                    // Retrieve data from content div
                    var lastYeetContent = yeetContent.toString();

                    // Append former textArea content to lastYeet div
                    var lastYeet = document.getElementById('lastYeet');

                    // lastYeet.appendChild(lastYeetContent);
                    lastYeet.innerHTML = "Last Yeet: " + lastYeetContent.toString();

                    // Clear textArea for new Yeet
                    document.getElementById("content").value = "";

                    // Parse.history.navigate('#/add', {trigger: true});
                }, function(error) {
                    console.log(JSON.stringify(error));
                    savedComment.destroy();

                });
            } else if (yeetContent.length < 1) {
                // Error message
                Materialize.toast('Gotta yeet somethin\', bub!', 4000, 'red');
            } else if (yeetContent.length > 220) {
                // Error message
                Materialize.toast('Watch it, bub! Yeets must be less than 220 characters.', 4000, 'red');
            }

            /*newYeet.set('thumbnail', thumbnailFile);
            newYeet.set('compressedBackImage', compressedFile);
            newYeet.set('compressedImage', compressedFile);
            newYeet.set('backImage', imageFile);
            newYeet.set('image', imageFile);
            newYeet.set('designImage', imageFile);
            newYeet.set('uuid', $generateUUID());*/

            this.model = this.model || new BlogApp.Models.Blog();
        },

        render: function() {
            var self = this,
                attributes;
            if (this.model) {
                attributes = this.model.toJSON();
                attributes.form_title = 'Edit Blog';
            } else {
                attributes = {
                    form_title: 'Add a Blog',
                    content: ''
                }
            }
            BlogApp.blogs.fetch().then(function(blogs) {
                attributes.blogs = BlogApp.fn.renderView({
                    View: BlogApp.Views.Blogs,
                    data: {
                        collection: blogs
                    },
                    notInsert: true
                });
                self.$el.html(self.template(attributes));

                var event; // The custom event that will be created
                if (document.createEvent) {
                    event = document.createEvent("HTMLEvents");
                    event.initEvent("DOMContentLoaded", true, true);
                } else {
                    event = document.createEventObject();
                    event.eventType = "DOMContentLoaded";
                }
                event.eventName = "DOMContentLoaded";
                /*if (document.createEvent) {
                    document.getElementsByTagName('canvas')[0].dispatchEvent(event);
                } else {
                    document.getElementsByTagName('canvas')[0].fireEvent("on" + event.eventType, event);
                }*/
            });
        }
    });



    // ########## ROUTER ##########
    BlogApp.Router = Parse.Router.extend({

        initialize: function(options) {
            BlogApp.blog = new BlogApp.Models.Blog();

            if (!currentUser) {
                console.log("There is no logged in user.")
            } else {
                BlogApp.blogs = new BlogApp.Collections.Blogs();
            }

            BlogApp.userDesigns = new BlogApp.Collections.UserDesigns();
            BlogApp.query = {
                blog: new Parse.Query(BlogApp.Models.Blog).include('author')
            };
        },

        start: function() {
            Parse.history.start({
                root: '/beta/'
            });
        },

        routes: {
            '': 'index',
            'yeet/:url': 'blog',
            'admin': 'admin',
            'login': 'login',
            'store': 'store',
            'myclubs': 'myclubs',
            'notifications': 'notifications',
            'reset': 'reset',
            'logout': 'logout',
            'add': 'add',
            'register': 'register',
            'editprofile': 'editprofile',
            'changeprofilepic': 'changeprofilepic',
            ':username': 'userprofile'
        },

        index: function() {
            BlogApp.fn.setPageType('blog');

            $blogs = [];

            if (!currentUser) {
                Parse.history.navigate('#/register', {
                    trigger: true
                });
                console.log("There is no logged in user.");
            } else {
                // console.log("Current User: " + currentUser);
                var currentGroup = currentUser.get('currentGroup');
                var designsQuery = new Parse.Query(BlogApp.Models.Blog).equalTo('groupId', currentGroup).include('author').include('groupId').descending('lastReplyUpdatedAt').limit(300);
                designsQuery.find({
                    success: function(blogs) {

                        for (var i in blogs) {
                            var des = blogs[i].toJSON();
                            des.author = blogs[i].get('author').toJSON();
                            $blogs.push(des);
                        }

                        // console.log(blogs);

                        BlogApp.fn.renderView({
                            View: BlogApp.Views.Blogs,
                            data: {
                                blogs: $blogs
                            }

                        });
                    },
                    error: function(blogs, e) {
                        console.log(JSON.stringify(e));
                    }
                });
            }
        },

        admin: function() {
            BlogApp.fn.setPageType('admin');

            var currentUser = Parse.User.current();

            $blogs = [];
            var q1 = new Parse.Query(BlogApp.Models.Blog).equalTo("author", currentUser);
            var q2 = new Parse.Query(BlogApp.Models.Blog).equalTo("downloaders", currentUser.id);
            var designsQuery = Parse.Query.or(q1, q2).skip($blogs.length).descending('lastReplyUpdatedAt').limit(50).include('author');
            designsQuery.find({
                success: function(designs) {

                    for (var i in designs) {
                        var des = designs[i].toJSON();
                        des.author = designs[i].get('author').toJSON();
                        $blogs.push(des);
                    }

                    BlogApp.fn.renderView({
                        View: BlogApp.Views.Welcome,
                        data: {
                            user: currentUser,
                            designs: $blogs
                        }

                    });
                },
                error: function(designs, e) {
                    console.log(JSON.stringify(e));
                }
            });
        },

        userprofile: function(username) {
            BlogApp.fn.setPageType('userprofile');
            var query = new Parse.Query(BlogApp.Models.User);
            query.equalTo('username', username);
            query.find().then(function(users) {
                $blogs = [];
                var q1 = new Parse.Query(BlogApp.Models.Blog).equalTo("author", users[0]);
                var q2 = new Parse.Query(BlogApp.Models.Blog).equalTo("downloaders", users[0].id);
                var designsQuery = Parse.Query.or(q1, q2).skip($blogs.length).descending('lastReplyUpdatedAt').limit(50).include('author');
                designsQuery.find({
                    success: function(designs) {
                        for (var i in designs) {
                            var des = designs[i].toJSON();
                            des.author = users[0].toJSON();
                            $blogs.push(des);
                        }

                        BlogApp.fn.renderView({
                            View: BlogApp.Views.Welcome,
                            data: {
                                user: users[0],
                                designs: $blogs
                            }
                        });
                    },
                    error: function(designs, e) {
                        console.log(JSON.stringify(e));
                    }
                });
            });
        },

        blog: function(url) {
            BlogApp.fn.setPageType('blog');
            BlogApp.query.blog.equalTo("objectId", url).find().then(function(blog) {
                var model = blog[0];
                var author = model.get('author');
                model = model.toJSON();
                model.author = author.toJSON();

                var likers = blog[0].get('likedBy'),
                    liked = false;
                var downloaders = blog[0].get('repliedToBy'),
                    downloaded = false;

                for (var j in downloaders) {
                    if (downloaders[j] == Parse.User.current().id) {
                        downloaded = true;
                        break;
                    }
                }

                for (j in likers) {
                    if (likers[j] == Parse.User.current().id) {
                        liked = true;
                        break;
                    }
                }

                if (liked) {
                    model.likeTitle = "You already liked this";
                } else {
                    model.likeTitle = "Like";
                }

                if (downloaded) {
                    model.downloadTitle = "You have downloaded it.";
                } else {
                    model.downloadTitle = "Download";
                    model.downloadProceed = true;
                }

                model.likeProceed = !liked;
                model.downloadProceed = !downloaded;

                BlogApp.fn.renderView({
                    View: BlogApp.Views.Blog,
                    data: {
                        model: model
                    }
                });

                BlogApp.blog = blog[0];
            });
        },

        login: function() {
            BlogApp.fn.setPageType('login');
            BlogApp.fn.renderView({
                View: BlogApp.Views.Login
            });
        },

        store: function() {
            BlogApp.fn.setPageType('store');
            BlogApp.fn.renderView({
                View: BlogApp.Views.Store
            });
        },

        myclubs: function() {
            BlogApp.fn.setPageType('myclubs');
            BlogApp.fn.renderView({
                View: BlogApp.Views.MyClubs
            });
        },

        notifications: function() {
            BlogApp.fn.setPageType('notifications');

            $blogs = [];

            if (!currentUser) {
                Parse.history.navigate('#/register', {
                    trigger: true
                });
                console.log("There is no logged in user.");
            } else {
                // console.log("Current User: " + currentUser);
                var currentGroup = currentUser.get('currentGroup');
                var currentUserId = currentUser.id;
                var designsQuery = new Parse.Query("Notification").equalTo('recipientId', currentUserId).include('author').include('groupId').descending('createdAt').limit(300);
                designsQuery.find({
                    success: function(blogs) {

                        for (var i in blogs) {
                            var des = blogs[i].toJSON();
                            des.author = blogs[i].get('author').toJSON();
                            $blogs.push(des);
                            des.group = blogs[i].get('groupId').toJSON();
                            $blogs.push(des);
                        }

                        // console.log(blogs);

                        BlogApp.fn.renderView({
                            View: BlogApp.Views.Notifications,
                            data: {
                                blogs: $blogs
                            }

                        });
                    },
                    error: function(blogs, e) {
                        console.log(JSON.stringify(e));
                    }
                });
            }
        },

        reset: function() {
            BlogApp.fn.setPageType('reset');
            BlogApp.fn.renderView({
                View: BlogApp.Views.Reset
            });
        },

        logout: function() {
            Parse.User.logOut();
            Parse.history.navigate('#/login', {
                trigger: true
            });
            window.location.reload();
        },

        add: function() {
            BlogApp.fn.setPageType('admin');
            BlogApp.fn.renderView({
                View: BlogApp.Views.WriteBlog
            });
        },

        register: function() {
            BlogApp.fn.setPageType('register');
            BlogApp.fn.renderView({
                View: BlogApp.Views.Register
            });
        },

        editprofile: function() {
            BlogApp.fn.setPageType('editprofile');
            var currentUser = Parse.User.current();
            BlogApp.fn.renderView({
                View: BlogApp.Views.EditMyProfile,
                data: {
                    model: currentUser
                }
            });
        },

        changeprofilepic: function() {
            BlogApp.fn.setPageType('changeprofilepic');
            var currentUser = Parse.User.current();
            BlogApp.fn.renderView({
                View: BlogApp.Views.ChangeProfilePicture,
                data: {
                    model: currentUser
                }
            });
        }

    });



    // ########## Render View Function ##########
    BlogApp.fn.renderView = function(options) {
        var View = options.View, // type of View
            data = options.data || null, // data obj to render in the view
            $container = options.$container || BlogApp.$container, // container to put the view
            notInsert = options.notInsert, // put the el in the container or return el as HTML
            view = new View(data);
        view.render();
        if (notInsert) {
            return view.el.outerHTML;
        } else {
            $container.html(view.el);
        }
    };



    // ########## Render Navigation Bar Everywhere ##########
    BlogApp.fn.getSidebar = function() {
        var currentUser = new Parse.User.current();

        if (!currentUser) {
            BlogApp.fn.renderView({
                View: BlogApp.Views.Navigation,
                $container: BlogApp.$sidebar
            });
        } else {
            // Render view with current user
            BlogApp.fn.renderView({
                View: BlogApp.Views.Navigation,
                data: {
                    model: currentUser
                },
                $container: BlogApp.$sidebar
            });      
        }
    };



    // ########## Set Page Type - Control 'Log In Required' ##########
    BlogApp.fn.setPageType = function(type) {
        if (type === "blog") {
            BlogApp.$nav.eq(0).addClass('active')
                .siblings().removeClass('active');
        } else {
            BlogApp.$nav.eq(1).addClass('active')
                .siblings().removeClass('active');
        }
        if (type === "admin") {
            BlogApp.fn.checkLogin();
        }
    };



    // ########## Check Log In - All Private Pages ##########
    BlogApp.fn.checkLogin = function() {
        var currentUser = Parse.User.current();
        if (!currentUser) {
            Parse.history.navigate('#/login', {
                trigger: true
            });
        }
    };



    // ########## Start ##########
    BlogApp.start();

});