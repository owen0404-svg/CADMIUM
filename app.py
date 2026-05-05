from flask import Flask, render_template, request, jsonify, session, redirect, url_for
from flask_sqlalchemy import SQLAlchemy
from flask_login import LoginManager, UserMixin, login_user, login_required, logout_user, current_user
from flask_bcrypt import Bcrypt
import json

app = Flask(__name__)
app.config['SECRET_KEY'] = 'your_secret_key_here'
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///database.db'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

db = SQLAlchemy(app)
bcrypt = Bcrypt(app)
login_manager = LoginManager(app)
login_manager.login_view = 'login'

class User(db.Model, UserMixin):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(20), unique=True, nullable=False)
    password = db.Column(db.String(60), nullable=False)
    projects = db.relationship('Project', backref='author', lazy=True)

class Project(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    data = db.Column(db.Text, nullable=False) # Store JSON as text
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)

class Component(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    data = db.Column(db.Text, nullable=False) # Store JSON as text
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    author = db.relationship('User', backref='components', lazy=True)

@login_manager.user_loader
def load_user(user_id):
    return User.query.get(int(user_id))

@app.route('/')
def home():
    return render_template('home.html')

@app.route('/workspace')
def workspace():
    return render_template('index.html')

@app.route('/api/register', methods=['POST'])
def register():
    data = request.get_json()
    username = data.get('username')
    password = data.get('password')
    
    if User.query.filter_by(username=username).first():
        return jsonify({'error': 'Username already exists'}), 400
        
    hashed_password = bcrypt.generate_password_hash(password).decode('utf-8')
    user = User(username=username, password=hashed_password)
    db.session.add(user)
    db.session.commit()
    
    login_user(user)
    return jsonify({'success': 'Registered successfully'})

@app.route('/api/login', methods=['POST'])
def login():
    data = request.get_json()
    username = data.get('username')
    password = data.get('password')
    
    user = User.query.filter_by(username=username).first()
    if user and bcrypt.check_password_hash(user.password, password):
        login_user(user)
        return jsonify({'success': 'Logged in successfully', 'username': user.username})
    else:
        return jsonify({'error': 'Login Unsuccessful. Please check username and password'}), 401

@app.route('/api/logout', methods=['POST'])
@login_required
def logout():
    logout_user()
    return jsonify({'success': 'Logged out successfully'})

@app.route('/api/status', methods=['GET'])
def status():
    if current_user.is_authenticated:
        return jsonify({'authenticated': True, 'username': current_user.username})
    return jsonify({'authenticated': False})

@app.route('/api/projects', methods=['GET'])
@login_required
def get_projects():
    projects = Project.query.filter_by(user_id=current_user.id).all()
    projects_list = [{'id': p.id, 'name': p.name} for p in projects]
    return jsonify(projects_list)

@app.route('/api/projects/<int:project_id>', methods=['GET'])
@login_required
def get_project(project_id):
    project = Project.query.get_or_404(project_id)
    if project.author != current_user:
        return jsonify({'error': 'Unauthorized'}), 403
    return jsonify({'id': project.id, 'name': project.name, 'data': json.loads(project.data)})

@app.route('/api/projects', methods=['POST'])
@login_required
def save_project():
    data = request.get_json()
    name = data.get('name')
    project_data = data.get('data')
    
    if not name or not project_data:
        return jsonify({'error': 'Missing name or data'}), 400
        
    project = Project(name=name, data=json.dumps(project_data), author=current_user)
    db.session.add(project)
    db.session.commit()
    
    return jsonify({'success': 'Project saved successfully', 'id': project.id})

@app.route('/api/components', methods=['GET'])
def get_components():
    components = Component.query.all()
    components_list = [{'id': c.id, 'name': c.name, 'author': c.author.username, 'data': json.loads(c.data)} for c in components]
    return jsonify(components_list)

@app.route('/api/components', methods=['POST'])
@login_required
def publish_component():
    data = request.get_json()
    name = data.get('name')
    component_data = data.get('data')
    
    if not name or not component_data:
        return jsonify({'error': 'Missing name or data'}), 400
        
    component = Component(name=name, data=json.dumps(component_data), author=current_user)
    db.session.add(component)
    db.session.commit()
    
    return jsonify({'success': 'Component published successfully', 'id': component.id})

if __name__ == '__main__':
    with app.app_context():
        db.create_all()
    app.run(debug=True, port=5000)
